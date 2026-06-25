import { prisma, PostStage, ContentMode, ContentItemStatus } from "@mirai/db";
import { ContentPolicySchema, Stage } from "@mirai/shared";
import {
  groundFromX,
  groundFromNicheAndTrends,
  type GroundingSignals,
} from "@mirai/content";
import { loadEnv } from "@mirai/shared";
import { xClient } from "../clients.js";
import { getXAccess } from "../tokens.js";
import { publishEvent, now } from "../publisher.js";
import { composeQueue, postJobId, type PostJob } from "../queues.js";
import { acquireCreativeWorkbenchSignals } from "../a2a/creative-workbench.js";

const env = loadEnv();

/**
 * ACQUIRE — gather the raw material for one post.
 *
 * AUTONOMOUS: pull owned-read signals (timeline + trends) → grounding note.
 * USER_SUPPLIED: claim the next PENDING ContentItem from the pool.
 * The result is persisted to rawMaterial so retries don't re-fetch (cost) and
 * the slot advances to COMPOSE.
 */
export async function processAcquire(job: PostJob): Promise<void> {
  const { campaignId, scheduledPostId } = job;
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Acquire,
    status: "started",
    at: now(),
  });

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { order: true, voiceProfile: true, contentPolicy: true },
  });

  let rawMaterial: string;

  if (campaign.contentMode === ContentMode.USER_SUPPLIED) {
    const item = await prisma.contentItem.findFirst({
      where: { campaignId, status: ContentItemStatus.PENDING },
      orderBy: { createdAt: "asc" },
    });
    if (!item) {
      // Nothing to post from the user's pool — skip this slot gracefully.
      await prisma.scheduledPost.update({
        where: { id: scheduledPostId },
        data: { stage: PostStage.SKIPPED, failureReason: "empty content pool" },
      });
      await publishEvent({
        type: "progress",
        campaignId,
        scheduledPostId,
        stage: Stage.Acquire,
        status: "skipped",
        message: "empty content pool",
        at: now(),
      });
      return;
    }
    await prisma.contentItem.update({
      where: { id: item.id },
      data: { status: ContentItemStatus.USED, usedByPostId: scheduledPostId },
    });
    rawMaterial = JSON.stringify({ kind: "user", rawText: item.rawText });
  } else {
    const policy = campaign.contentPolicy
      ? ContentPolicySchema.parse(campaign.contentPolicy)
      : null;
    const topics = [
      ...(campaign.voiceProfile?.topics ?? []),
      ...(policy?.allowedTopics ?? []),
    ];
    const baseSignals = await acquireAutonomousSignals(
      campaignId,
      topics,
      campaign.voiceProfile?.niche ?? null,
    );
    const signals = shouldUseCreativeWorkbenchDelegation({
      topics,
      niche: campaign.voiceProfile?.niche ?? null,
      policy,
      baseSignals,
    })
      ? await acquireCreativeWorkbenchSignals({
          campaignId,
          scheduledPostId,
          upstreamCrooOrderId: campaign.order.crooOrderId,
          topics,
          niche: campaign.voiceProfile?.niche ?? null,
          baseSignals,
          voiceProfile: campaign.voiceProfile
            ? {
                tone: campaign.voiceProfile.tone,
                topics: campaign.voiceProfile.topics,
                styleNotes: campaign.voiceProfile.styleNotes,
                doNots: campaign.voiceProfile.doNots,
              }
            : null,
          contentPolicy: policy,
        })
      : baseSignals;
    rawMaterial = JSON.stringify({ kind: "autonomous", signals });
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { stage: PostStage.ACQUIRED, rawMaterial },
  });
  await composeQueue.add("compose", job, {
    jobId: postJobId("compose", scheduledPostId),
  });
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Acquire,
    status: "completed",
    at: now(),
  });
}

function shouldUseCreativeWorkbenchDelegation(args: {
  topics: string[];
  niche: string | null;
  policy: ReturnType<typeof ContentPolicySchema.parse> | null;
  baseSignals: GroundingSignals;
}): boolean {
  if (!env.CROO_SDK_KEY) return false;
  const haystack = [
    args.niche,
    ...args.topics,
    ...(args.policy?.allowedTopics ?? []),
    ...(args.policy?.toneRules ?? []),
    ...(args.policy?.formatRules ?? []),
    ...args.baseSignals.themes,
    ...args.baseSignals.trends,
    args.baseSignals.note,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    "content",
    "creator",
    "kol",
    "social",
    "twitter",
    "x ",
    "post",
    "campaign",
    "copy",
    "audience",
    "brand",
    "voice",
    "ai agent",
  ].some((keyword) => haystack.includes(keyword));
}

async function acquireAutonomousSignals(
  campaignId: string,
  topics: string[],
  niche: string | null,
): Promise<GroundingSignals> {
  try {
    const access = await getXAccess(campaignId);
    const [timeline, trends] = await Promise.all([
      xClient.getHomeTimeline(access.accessToken, access.xUserId),
      xClient.getPersonalizedTrends(access.accessToken),
    ]);
    if (timeline.length > 0 || trends.length > 0) {
      return groundFromX(timeline, trends, topics);
    }
    return groundFromNicheAndTrends(
      niche ?? topics[0] ?? "general",
      topics,
      trends,
    );
  } catch {
    // Degrade to niche-based grounding if reads fail (rate limit, etc.).
    return groundFromNicheAndTrends(niche ?? topics[0] ?? "general", topics);
  }
}
