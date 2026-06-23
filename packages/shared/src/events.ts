/**
 * Internal event bus types.
 *
 * The agent worker is the SOLE holder of the CROO WebSocket (1 WS per API key),
 * so the dashboard must NOT open its own CROO connection. Instead the agent
 * publishes pipeline progress to a Redis pub/sub channel; the web server
 * subscribes and proxies these to the browser over SSE.
 */

/** Pipeline stage names — one per BullMQ queue. */
export const Stage = {
  Intake: "INTAKE",
  Brief: "BRIEF",
  Plan: "PLAN",
  Acquire: "ACQUIRE",
  Compose: "COMPOSE",
  Review: "REVIEW",
  Post: "POST",
  Record: "RECORD",
  Deliver: "DELIVER",
  Complete: "COMPLETE",
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

/** A progress event emitted as a post (or the campaign) advances a stage. */
export interface ProgressEvent {
  type: "progress";
  campaignId: string;
  /** Present for per-post stages (ACQUIRE..RECORD); absent for campaign-level. */
  scheduledPostId?: string;
  stage: Stage;
  status: "started" | "completed" | "failed" | "skipped";
  message?: string;
  /** ISO timestamp, stamped by the emitter. */
  at: string;
}

/** Campaign-level lifecycle event (e.g. WAITING_FOR_X → ACTIVE → COMPLETED). */
export interface CampaignEvent {
  type: "campaign";
  campaignId: string;
  status: "WAITING_FOR_X" | "ACTIVE" | "PAUSED" | "COMPLETED";
  at: string;
}

export type MiraiEvent = ProgressEvent | CampaignEvent;

/** Channel name helper — scopes events per campaign for the SSE proxy. */
export function campaignChannel(base: string, campaignId: string): string {
  return `${base}:campaign:${campaignId}`;
}
