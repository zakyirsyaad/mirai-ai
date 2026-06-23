import { Worker } from "bullmq";
import { sharedConnection } from "./redis.js";
import { QUEUE, type CampaignJob, type PostJob } from "./queues.js";
import { processCampaign } from "./stages/campaign.js";
import { processAcquire } from "./stages/acquire.js";
import { processCompose } from "./stages/compose.js";
import { processReview } from "./stages/review.js";
import { processPost } from "./stages/post.js";
import { processRecord } from "./stages/record.js";

/**
 * Wire one BullMQ Worker per stage queue. Concurrency is modest per stage; the
 * POST stage is intentionally serial (concurrency 1) because CROO PayOrder and
 * X writes should not be hammered in parallel from a single account/key.
 */
const connection = sharedConnection();

export function startWorkers(): Worker[] {
  const workers: Worker[] = [
    new Worker<CampaignJob>(QUEUE.Campaign, (job) => processCampaign(job.data), {
      connection,
      concurrency: 4,
    }),
    new Worker<PostJob>(QUEUE.Acquire, (job) => processAcquire(job.data), {
      connection,
      concurrency: 4,
    }),
    new Worker<PostJob>(QUEUE.Compose, (job) => processCompose(job.data), {
      connection,
      concurrency: 4,
    }),
    new Worker<PostJob>(QUEUE.Review, (job) => processReview(job.data), {
      connection,
      concurrency: 8,
    }),
    new Worker<PostJob>(QUEUE.Post, (job) => processPost(job.data), {
      connection,
      concurrency: 1,
    }),
    new Worker<PostJob>(QUEUE.Record, (job) => processRecord(job.data), {
      connection,
      concurrency: 4,
    }),
  ];

  for (const w of workers) {
    w.on("failed", (job, err) => {
      console.error(`[worker:${w.name}] job ${job?.id} failed:`, err.message);
    });
  }
  return workers;
}
