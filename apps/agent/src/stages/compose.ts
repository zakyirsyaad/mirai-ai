import { prisma, PostStage } from "@mirai/db";
import {
  ContentPolicySchema,
  Stage,
  type VoiceProfilePayload,
} from "@mirai/shared";
import {
  runDraftTournament,
  writeVariants,
  rewrite,
  type DraftTournamentResult,
  type GroundingSignals,
} from "@mirai/content";
import { llm } from "../clients.js";
import { publishEvent, now } from "../publisher.js";
import { reviewQueue, postJobId, type PostJob } from "../queues.js";

/**
 * COMPOSE — turn the acquired material into a draft tweet, on-voice. Reads
 * rawMaterial (produced by ACQUIRE), writes draftText, advances to REVIEW.
 */
interface AcquiredAutonomous {
  kind: "autonomous";
  signals: GroundingSignals;
  draftTournament?: DraftTournamentResult;
}
interface AcquiredUser {
  kind: "user";
  rawText: string;
}
type Acquired = AcquiredAutonomous | AcquiredUser;

export async function processCompose(job: PostJob): Promise<void> {
  const { campaignId, scheduledPostId } = job;
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Compose,
    status: "started",
    at: now(),
  });

  const post = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
    include: { campaign: { include: { voiceProfile: true, contentPolicy: true } } },
  });
  const vp = post.campaign.voiceProfile;
  if (!vp) throw new Error(`Campaign ${campaignId} has no voice profile.`);

  const voice: VoiceProfilePayload = {
    tone: vp.tone,
    topics: vp.topics,
    styleNotes: vp.styleNotes,
    doNots: vp.doNots,
    sampleVoice: vp.sampleVoice,
  };

  const acquired = JSON.parse(post.rawMaterial ?? "{}") as Acquired;
  const policy = post.campaign.contentPolicy
    ? ContentPolicySchema.parse(post.campaign.contentPolicy)
    : null;
  let draft: string;
  let rawMaterial = post.rawMaterial ?? "{}";
  if (acquired.kind === "user") {
    draft = await rewrite(llm, acquired.rawText, voice, policy);
  } else {
    const angle =
      post.angle ??
      acquired.signals.angle ??
      acquired.signals.themes[0] ??
      "an update";
    const variants = await writeVariants(
      llm,
      {
        angle,
        signals: acquired.signals,
        policy,
      },
      voice,
    );
    const tournament = runDraftTournament({
      drafts: variants,
      recent: await getRecentDrafts(campaignId, scheduledPostId),
      policy,
      topics: [...voice.topics, ...(policy?.allowedTopics ?? [])],
      angle,
    });
    draft = tournament.winner.text;
    rawMaterial = JSON.stringify({
      ...acquired,
      draftTournament: tournament,
    });
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { stage: PostStage.COMPOSED, draftText: draft, rawMaterial },
  });
  await reviewQueue.add("review", job, {
    jobId: postJobId("review", scheduledPostId),
  });
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Compose,
    status: "completed",
    at: now(),
  });
}

async function getRecentDrafts(
  campaignId: string,
  scheduledPostId: string,
): Promise<string[]> {
  const posts = await prisma.scheduledPost.findMany({
    where: {
      campaignId,
      id: { not: scheduledPostId },
      draftText: { not: null },
    },
    orderBy: { slotIndex: "desc" },
    take: 25,
  });
  return posts.map((post) => post.draftText).filter(isString);
}

function isString(value: string | null): value is string {
  return typeof value === "string" && value.length > 0;
}
