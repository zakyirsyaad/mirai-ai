import type { Env } from "@mirai/shared";
import { isRealXMode, isScraperXMode } from "@mirai/shared";
import type { XClient } from "./types.js";
import { MockXClient } from "./mock.js";
import { RealXClient } from "./real.js";
import { ScraperXClient } from "./scraper.js";

/**
 * Pick the X adapter from config. Defaults to the mock unless `X_MODE=real`
 * AND client credentials are present — so a missing key never silently posts
 * to a real account.
 *
 * `X_MODE=scraper` uses the xbird REST API (operator pays via x402 USDC).
 */
export function createXClient(env: Env): XClient {
  if (isScraperXMode(env)) return new ScraperXClient();
  return isRealXMode(env) ? new RealXClient() : new MockXClient();
}
