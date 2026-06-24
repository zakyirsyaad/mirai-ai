import { prisma, CampaignStatus, PostStage } from "@mirai/db";
import { campaignQueue, postJobId } from "./queues.js";
import { enqueueAcquire } from "./stages/campaign.js";

/**
 * Time-driven scheduler. Polls on an interval and:
 *  - fans each due PLANNED slot of an ACTIVE, enabled campaign into ACQUIRE;
 *  - finalizes campaigns whose access window has closed.
 *
 * Enqueues use deterministic jobIds, so the poll is safe to run repeatedly —
 * an already-enqueued or already-advanced slot won't be duplicated.
 */

const TICK_MS = 30_000;
let timer: NodeJS.Timeout | undefined;

export function startScheduler(): void {
  timer = setInterval(() => {
    void tick().catch((err) => {
      console.error("[scheduler] tick error:", err);
    });
  }, TICK_MS);
  // Run one immediately on boot.
  void tick().catch((err) => console.error("[scheduler] initial tick:", err));
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
}

async function tick(): Promise<void> {
  const nowDate = new Date();

  // 1) Due posts in active campaigns → ACQUIRE.
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      stage: PostStage.PLANNED,
      scheduledFor: { lte: nowDate },
      campaign: {
        status: CampaignStatus.ACTIVE,
        enabled: true,
        accessExpiresAt: { gt: nowDate },
      },
    },
    select: { id: true, campaignId: true },
    take: 100,
  });
  for (const p of duePosts) {
    await enqueueAcquire(p.campaignId, p.id);
  }

  // 2) Campaigns past their window → local final report/finalize (once).
  const expired = await prisma.campaign.findMany({
    where: {
      status: CampaignStatus.ACTIVE,
      accessExpiresAt: { lte: nowDate },
    },
    select: { id: true },
    take: 50,
  });
  for (const c of expired) {
    await campaignQueue.add(
      "deliver",
      { action: "deliver", campaignId: c.id },
      { jobId: postJobId("deliver", c.id) },
    );
  }
}
