import type { Env } from "@mirai/shared";
import { isRealXMode } from "@mirai/shared";
import type { XClient } from "./types.js";
import { MockXClient } from "./mock.js";
import { RealXClient } from "./real.js";

/**
 * Pick the X adapter from config. Defaults to the mock unless `X_MODE=real`
 * AND client credentials are present — so a missing key never silently posts
 * to a real account.
 */
export function createXClient(env: Env): XClient {
  return isRealXMode(env) ? new RealXClient() : new MockXClient();
}
