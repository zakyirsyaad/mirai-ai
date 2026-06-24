import { startScheduler, stopScheduler } from "./scheduler.js";
import { startWorkers } from "./workers.js";
import { campaignQueue } from "./queues.js";

export function startLocalRuntime(): { close: () => Promise<void> } {
  const workers = startWorkers();
  startScheduler();
  return {
    close: async () => {
      stopScheduler();
      await Promise.allSettled(workers.map((w) => w.close()));
    },
  };
}

export async function enqueueCampaignStart(campaignId: string): Promise<void> {
  await campaignQueue.add(
    "start",
    { action: "start", campaignId },
    { jobId: `start--${campaignId}` },
  );
}
