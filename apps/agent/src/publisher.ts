import { loadEnv, campaignChannel, type MiraiEvent } from "@mirai/shared";
import { createRedis } from "./redis.js";

/**
 * Publishes pipeline progress to Redis pub/sub. The web server subscribes and
 * proxies to the browser via SSE — the agent stays the single owner of both the
 * CROO WebSocket and the canonical event stream.
 */
const env = loadEnv();
const pub = createRedis();

export async function publishEvent(event: MiraiEvent): Promise<void> {
  const channel = campaignChannel(env.AGENT_EVENT_CHANNEL, event.campaignId);
  await pub.publish(channel, JSON.stringify(event));
}

/** Convenience: stamp `at` is the caller's job (Date allowed in app runtime). */
export function now(): string {
  return new Date().toISOString();
}
