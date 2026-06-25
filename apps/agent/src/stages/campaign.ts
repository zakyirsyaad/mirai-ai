import { prisma, CampaignStatus, PostStage } from "@mirai/db";
import {
  ServiceType,
  Stage,
  type ContentAgentDeliverable,
} from "@mirai/shared";
import { publishEvent, now } from "../publisher.js";
import { acquireQueue, postJobId, type CampaignJob } from "../queues.js";
import { redactA2ASecrets } from "../a2a/redaction.js";

/**
 * Campaign-level processor — handles INTAKE→BRIEF→PLAN ("start") and the final
 * DELIVER. Per-post work fans out to the per-post stage queues.
 */

/** Number of posts to schedule across the access window (Service #1). */
const POSTS_PER_CAMPAIGN = 14; // ~2/day for 7 days
const WINDOW_DAYS = 7;

export async function processCampaign(job: CampaignJob): Promise<void> {
  if (job.action === "start") return startCampaign(job.campaignId);
  return deliverCampaign(job.campaignId);
}

/**
 * BRIEF + PLAN: lay out the posting schedule. Requires the buyer to have
 * connected X and a voice profile to exist; otherwise the campaign waits.
 */
async function startCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      voiceProfile: true,
      session: { include: { xConnection: true } },
      scheduledPosts: true,
    },
  });

  if (!campaign.session.xConnection || !campaign.voiceProfile) {
    // Not ready yet — the web app re-triggers start once X is connected.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.WAITING_FOR_X },
    });
    await publishEvent({
      type: "campaign",
      campaignId,
      status: "WAITING_FOR_X",
      at: now(),
    });
    return;
  }

  // Idempotent: only create slots once.
  if (campaign.scheduledPosts.length === 0) {
    const start = campaign.createdAt.getTime();
    const spacingMs = (WINDOW_DAYS * 24 * 60 * 60 * 1000) / POSTS_PER_CAMPAIGN;
    const rows = Array.from({ length: POSTS_PER_CAMPAIGN }, (_, i) => ({
      campaignId,
      slotIndex: i,
      scheduledFor: new Date(start + Math.round(spacingMs * (i + 0.5))),
      stage: PostStage.PLANNED,
    }));
    await prisma.scheduledPost.createMany({ data: rows });
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.ACTIVE },
  });
  await publishEvent({
    type: "campaign",
    campaignId,
    status: "ACTIVE",
    at: now(),
  });
}

/**
 * DELIVER: assemble the proof-of-work report and close the local campaign.
 * CROO order settlement happens immediately after license delivery; the final
 * campaign report remains available through MCP.
 */
async function deliverCampaign(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: {
      order: true,
      session: { include: { xConnection: true } },
      scheduledPosts: { orderBy: { slotIndex: "asc" } },
      a2aDelegations: { orderBy: { createdAt: "asc" } },
    },
  });

  const posts = campaign.scheduledPosts;
  const deliverable: ContentAgentDeliverable = {
    service: ServiceType.ContentAgent7d,
    campaignId,
    xHandle: campaign.session.xConnection?.xHandle ?? "unknown",
    windowStart: campaign.createdAt.toISOString(),
    windowEnd: campaign.accessExpiresAt.toISOString(),
    summary: {
      planned: posts.length,
      posted: posts.filter((p) => p.stage === PostStage.RECORDED || p.tweetId)
        .length,
      skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
      failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
    },
    posts: posts.map((p) => ({
      scheduledFor: p.scheduledFor.toISOString(),
      postedAt: p.postedAt ? p.postedAt.toISOString() : null,
      tweetId: p.tweetId,
      tweetUrl: p.tweetUrl,
      text: p.draftText ?? "",
      status:
        p.stage === PostStage.SKIPPED
          ? "SKIPPED"
          : p.tweetId
            ? "POSTED"
            : "FAILED",
      metrics:
        (p.metrics as ContentAgentDeliverable["posts"][number]["metrics"]) ??
        undefined,
    })),
    a2aDelegations: campaign.a2aDelegations.map((delegation) => ({
      downstreamAgent: delegation.downstreamAgent,
      downstreamServiceId: delegation.downstreamServiceId,
      downstreamNegotiationId: delegation.downstreamNegotiationId,
      downstreamOrderId: delegation.downstreamOrderId,
      status: delegation.status,
      request: delegation.requestJson,
      response: redactA2ASecrets(delegation.responseJson ?? null),
      error: delegation.error,
      startedAt: delegation.startedAt.toISOString(),
      paidAt: delegation.paidAt?.toISOString() ?? null,
      completedAt: delegation.completedAt?.toISOString() ?? null,
    })),
  };

  console.log(
    `[campaign] final report generated for ${campaignId}: ${deliverable.summary.posted}/${deliverable.summary.planned} posted.`,
  );

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: CampaignStatus.COMPLETED, enabled: false },
  });

  await publishEvent({
    type: "progress",
    campaignId,
    stage: Stage.Deliver,
    status: "completed",
    at: now(),
  });
  await publishEvent({
    type: "campaign",
    campaignId,
    status: "COMPLETED",
    at: now(),
  });
}

/** Re-export so the scheduler can fan a planned slot into ACQUIRE. */
export async function enqueueAcquire(
  campaignId: string,
  scheduledPostId: string,
): Promise<void> {
  await acquireQueue.add(
    "acquire",
    { campaignId, scheduledPostId },
    { jobId: postJobId("acquire", scheduledPostId) },
  );
}
