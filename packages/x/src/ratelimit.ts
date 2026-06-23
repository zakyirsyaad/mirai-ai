/**
 * Lightweight rate-limit guard + read cache.
 *
 * X read endpoints return `x-rate-limit-remaining` / `x-rate-limit-reset`
 * headers. We track them per endpoint key and surface a wait hint so the POST
 * stage can back off instead of hammering a 429. Owned reads are also cached
 * (24h dedupe billing) to keep cost near zero.
 */

export interface RateState {
  remaining: number;
  resetAt: number; // epoch ms
}

export class RateLimiter {
  private readonly state = new Map<string, RateState>();

  /** Record rate-limit headers from a response. */
  observe(key: string, headers: Headers): void {
    const remaining = headers.get("x-rate-limit-remaining");
    const reset = headers.get("x-rate-limit-reset");
    if (remaining !== null && reset !== null) {
      this.state.set(key, {
        remaining: Number(remaining),
        resetAt: Number(reset) * 1000,
      });
    }
  }

  /** Ms to wait before `key` is safe to call again (0 if ok). */
  waitMs(key: string, now: number): number {
    const s = this.state.get(key);
    if (!s) return 0;
    if (s.remaining > 0) return 0;
    return Math.max(0, s.resetAt - now);
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** TTL cache for owned reads (default 24h to match X's dedupe billing). */
export class ReadCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly defaultTtlMs = 24 * 60 * 60 * 1000) {}

  get<T>(key: string, now: number): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, now: number, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: now + ttlMs });
  }
}
