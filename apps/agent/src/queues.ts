import { Queue } from "bullmq";
import { sharedConnection } from "./redis.js";

/**
 * BullMQ queue topology — one queue per pipeline stage.
 *
 * Campaign-level stages (start = BRIEF+PLAN, deliver = DELIVER) operate on a
 * whole campaign. Per-post stages (ACQUIRE → COMPOSE → REVIEW → POST → RECORD)
 * each carry a single scheduledPostId and hand off to the next stage. Every job
 * is idempotent and keyed by a deterministic jobId so retries don't duplicate.
 */

export const QUEUE = {
  Campaign: "mirai.campaign",
  Acquire: "mirai.acquire",
  Compose: "mirai.compose",
  Review: "mirai.review",
  Post: "mirai.post",
  Record: "mirai.record",
} as const;

export interface CampaignJob {
  action: "start" | "deliver";
  campaignId: string;
}

export interface PostJob {
  campaignId: string;
  scheduledPostId: string;
}

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

const queueOpts = () => ({
  connection: sharedConnection(),
  defaultJobOptions,
});

export const campaignQueue = new Queue<CampaignJob>(QUEUE.Campaign, queueOpts());
export const acquireQueue = new Queue<PostJob>(QUEUE.Acquire, queueOpts());
export const composeQueue = new Queue<PostJob>(QUEUE.Compose, queueOpts());
export const reviewQueue = new Queue<PostJob>(QUEUE.Review, queueOpts());
export const postQueue = new Queue<PostJob>(QUEUE.Post, queueOpts());
export const recordQueue = new Queue<PostJob>(QUEUE.Record, queueOpts());

/** Stable job id so the same (stage, post) is never enqueued twice. */
export function postJobId(stage: string, scheduledPostId: string): string {
  return `${stage}:${scheduledPostId}`;
}
