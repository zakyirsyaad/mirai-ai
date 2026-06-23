import { loadEnv } from "@mirai/shared";
import { describeClients } from "./clients.js";
import { startWorkers } from "./workers.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { startCroo, crooClient } from "./croo.js";

/**
 * Agent entry point.
 *
 * Boots, in order:
 *  1. BullMQ stage workers (the pipeline);
 *  2. the time-driven scheduler (due posts + deliveries);
 *  3. the CROO Provider WebSocket (intake of new orders).
 *
 * The CROO connection is optional in local dev: without CROO_SDK_KEY the agent
 * still runs the pipeline for campaigns created by other means (e.g. the web
 * app / tests), which keeps end-to-end development possible offline.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  console.log(`[agent] starting — ${describeClients()}, env=${env.NODE_ENV}`);

  const workers = startWorkers();
  startScheduler();

  if (env.CROO_SDK_KEY) {
    try {
      await startCroo();
      console.log("[agent] CROO Provider WebSocket connected.");
    } catch (err) {
      console.error("[agent] CROO connect failed (continuing offline):", err);
    }
  } else {
    console.warn(
      "[agent] CROO_SDK_KEY not set — running pipeline only, no marketplace intake.",
    );
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[agent] ${signal} received — shutting down.`);
    stopScheduler();
    await Promise.allSettled(workers.map((w) => w.close()));
    if (env.CROO_SDK_KEY) {
      try {
        await crooClient().disconnect();
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
