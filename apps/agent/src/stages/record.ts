import { prisma, PostStage } from "@mirai/db";
import { scorePerformance } from "@mirai/content";
import { Stage } from "@mirai/shared";
import { xClient } from "../clients.js";
import { getXAccess } from "../tokens.js";
import { publishEvent, now } from "../publisher.js";
import type { PostJob } from "../queues.js";

/**
 * RECORD — fetch engagement metrics for the just-posted tweet (owned read) and
 * persist them. Terminal per-post stage; metrics feed the final deliverable.
 * Metric fetch failures are non-fatal (the post still counts as delivered).
 */
export async function processRecord(job: PostJob): Promise<void> {
  const { campaignId, scheduledPostId } = job;
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Record,
    status: "started",
    at: now(),
  });

  const post = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
  });

  let metrics: Record<string, number> | undefined;
  if (post.tweetId) {
    try {
      const access = await getXAccess(campaignId);
      const all = await xClient.getTweetMetrics(access.accessToken, [
        post.tweetId,
      ]);
      const m = all[post.tweetId];
      if (m) metrics = { ...m, performanceScore: scorePerformance(m) };
    } catch {
      // Non-fatal — leave metrics unset.
    }
  }

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: { stage: PostStage.RECORDED, metrics: metrics ?? undefined },
  });
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Record,
    status: "completed",
    at: now(),
  });
}
