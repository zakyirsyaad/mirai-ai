import { prisma, PostStage } from "@mirai/db";
import { Stage } from "@mirai/shared";
import { xClient } from "../clients.js";
import { getXAccess } from "../tokens.js";
import { publishEvent, now } from "../publisher.js";
import { recordQueue, postJobId, type PostJob } from "../queues.js";
import { checkCampaignEntitlement } from "../entitlements.js";

/**
 * POST — publish the reviewed draft to X. Idempotent: if a tweetId already
 * exists for this slot we skip re-posting (a retry after a network blip must
 * not double-post). Advances to RECORD.
 */
export async function processPost(job: PostJob): Promise<void> {
  const { campaignId, scheduledPostId } = job;
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Post,
    status: "started",
    at: now(),
  });

  const post = await prisma.scheduledPost.findUniqueOrThrow({
    where: { id: scheduledPostId },
  });

  await checkCampaignEntitlement(campaignId);

  if (post.tweetId) {
    // Already posted — go straight to RECORD.
    await recordQueue.add("record", job, {
      jobId: postJobId("record", scheduledPostId),
    });
    return;
  }

  const access = await getXAccess(campaignId);
  const result = await xClient.postTweet(
    access.accessToken,
    post.draftText ?? "",
  );

  await prisma.scheduledPost.update({
    where: { id: scheduledPostId },
    data: {
      stage: PostStage.POSTED,
      tweetId: result.id,
      tweetUrl: result.url,
      postedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  await recordQueue.add("record", job, {
    jobId: postJobId("record", scheduledPostId),
  });
  await publishEvent({
    type: "progress",
    campaignId,
    scheduledPostId,
    stage: Stage.Post,
    status: "completed",
    message: result.url,
    at: now(),
  });
}
