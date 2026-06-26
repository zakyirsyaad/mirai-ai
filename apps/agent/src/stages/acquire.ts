import { prisma, PostStage, ContentMode, ContentItemStatus } from "@mirai/db";
import { ContentPolicySchema, Stage } from "@mirai/shared";
import {
  groundFromX,
  groundFromNicheAndTrends,
  type GroundingSignals,
  type PerformanceHistoryItem,
} from "@mirai/content";
import type { XTweetMetrics } from "@mirai/x";
import { loadEnv } from "@mirai/shared";
import { xClient } from "../clients.js";
import { getXAccess } from "../tokens.js";
import { publishEvent, now } from "../publisher.js";
import { composeQueue, postJobId, type PostJob } from "../queues.js";
import { orchestrateUniversalWorkbench } from "../a2a/workbench-orchestrator.js";

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
  let selectedAngle: string | undefined;

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
    let signals = baseSignals;
    if (
      shouldUseCreativeWorkbenchDelegation({
        topics,
        niche: campaign.voiceProfile?.niche ?? null,
        policy,
        baseSignals,
      })
    ) {
      const orchestration = await orchestrateUniversalWorkbench({
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
      });
      if (orchestration.safety.verdict === "BLOCK") {
        const message =
          orchestration.safety.reason ??
          "Universal Workbench safety review blocked this post.";
        await prisma.scheduledPost.update({
          where: { id: scheduledPostId },
          data: {
            stage: PostStage.SKIPPED,
            failureReason: message,
          },
        });
        await publishEvent({
          type: "progress",
          campaignId,
          scheduledPostId,
          stage: Stage.Acquire,
          status: "skipped",
          message,
          at: now(),
        });
        return;
      }
      signals = orchestration.signals;
    }
    selectedAngle = signals.angle;
    rawMaterial = JSON.stringify({ kind: "autonomous", signals });
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: {
      stage: PostStage.ACQUIRED,
      rawMaterial,
      angle: selectedAngle,
    },
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
  const history = await getCampaignPerformanceHistory(campaignId);
  try {
    const access = await getXAccess(campaignId);
    const [timeline, trends] = await Promise.all([
      xClient.getHomeTimeline(access.accessToken, access.xUserId),
      xClient.getPersonalizedTrends(access.accessToken),
    ]);
    if (timeline.length > 0 || trends.length > 0) {
      return groundFromX(timeline, trends, topics, {
        niche,
        recentPosts: history.recentPosts,
        history: history.performance,
      });
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

async function getCampaignPerformanceHistory(campaignId: string): Promise<{
  recentPosts: string[];
  performance: PerformanceHistoryItem[];
}> {
  const posts = await prisma.scheduledPost.findMany({
    where: {
      campaignId,
      draftText: { not: null },
    },
    orderBy: { slotIndex: "desc" },
    take: 25,
  });

  return {
    recentPosts: posts.map((post) => post.draftText).filter(isString),
    performance: posts
      .map((post) => ({
        text: post.draftText ?? "",
        angle: post.angle,
        metrics: toTweetMetrics(post.metrics),
      }))
      .filter((item) => item.text.length > 0 && item.metrics !== null),
  };
}

function toTweetMetrics(value: unknown): XTweetMetrics | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const likes = asNumber(record.likes);
  const reposts = asNumber(record.reposts);
  const replies = asNumber(record.replies);
  const impressions = asNumber(record.impressions);
  if (
    likes === null ||
    reposts === null ||
    replies === null ||
    impressions === null
  ) {
    return null;
  }
  return { likes, reposts, replies, impressions };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
