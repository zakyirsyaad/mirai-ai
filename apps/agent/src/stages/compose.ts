import { prisma, PostStage } from "@mirai/db";
import {
  ContentPolicySchema,
  Stage,
  type VoiceProfilePayload,
} from "@mirai/shared";
import { write, rewrite, type GroundingSignals } from "@mirai/content";
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
  if (acquired.kind === "user") {
    draft = await rewrite(llm, acquired.rawText, voice, policy);
  } else {
    draft = await write(
      llm,
      {
        angle: post.angle ?? acquired.signals.themes[0] ?? "an update",
        signals: acquired.signals,
        policy,
      },
      voice,
    );
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { stage: PostStage.COMPOSED, draftText: draft },
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
