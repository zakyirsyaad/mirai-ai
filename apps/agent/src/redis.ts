import { Redis } from "ioredis";
import { loadEnv } from "@mirai/shared";

/**
 * Shared ioredis connections.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connection. We keep one
 * connection for queues/workers and a separate one for pub/sub (a Redis
 * connection in subscribe mode can't run other commands).
 */
const env = loadEnv();

export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Lazily-created shared connection for BullMQ queues. */
let shared: Redis | undefined;
export function sharedConnection(): Redis {
  if (!shared) shared = createRedis();
  return shared;
}
