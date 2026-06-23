import { prisma, PostStage } from "@mirai/db";
import { Stage } from "@mirai/shared";
import { review } from "@mirai/content";
import { publishEvent, now } from "../publisher.js";
import { postQueue, postJobId, type PostJob } from "../queues.js";

/**
 * REVIEW — automated safety/quality/dedupe gate (no human approval). Passing
 * drafts advance to POST; failing drafts are SKIPPED with a reason.
 */
export async function processReview(job: PostJob): Promise<void> {
  const { campaignId, scheduledPostId } = job;
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Review,
    status: "started",
    at: now(),
  });

  const post = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
  });

  // Recently posted text in this campaign, for near-duplicate detection.
  const recentPosts = await prisma.scheduledPost.findMany({
    where: {
      campaignId,
      tweetId: { not: null },
      id: { not: scheduledPostId },
    },
    select: { draftText: true },
    orderBy: { postedAt: "desc" },
    take: 20,
  });
  const recent = recentPosts.map((p) => p.draftText ?? "").filter(Boolean);

  const verdict = review({ text: post.draftText ?? "", recent });

  if (!verdict.ok) {
    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        stage: PostStage.SKIPPED,
        failureReason: verdict.reasons.join("; "),
      },
    });
    await publishEvent({
      type: "progress",
      campaignId,
      scheduledPostId,
      stage: Stage.Review,
      status: "skipped",
      message: verdict.reasons.join("; "),
      at: now(),
    });
    return;
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { stage: PostStage.REVIEWED },
  });
  await postQueue.add("post", job, {
    jobId: postJobId("post", scheduledPostId),
  });
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Review,
    status: "completed",
    at: now(),
  });
}
