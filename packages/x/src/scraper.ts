import { loadEnv } from "@mirai/shared";
import type {
  PostResult,
  XClient,
  XTrend,
  XTweet,
  XTweetMetrics,
  XUser,
} from "./types.js";
import { RateLimiter, ReadCache } from "./ratelimit.js";

/**
 * xbird REST API adapter. Uses browser session cookies (via stateless token)
 * to proxy Twitter API calls through xbird's server.
 *
 * Cost-aware by design — same as RealXClient:
 *  - reads are cached 24h (matching xbird's dedupe billing window);
 *  - writes default to plain text (URLs cost more).
 *
 * Payment is handled by xbird via x402 micropayments (USDC on Base mainnet).
 * The operator funds the wallet; end-users don't need wallets.
 */
export class ScraperXClient implements XClient {
  readonly mode = "scraper" as const;

  private readonly limiter = new RateLimiter();
  private readonly cache = new ReadCache();
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? loadEnv().XBIRD_API_URL;
  }

  private authHeaders(token: string): Record<string, string> {
    // Stateless token (xbird_sk_...) → single header
    if (token.startsWith("xbird_sk_")) {
      return { "X-Encryption-Key": token };
    }
    // Raw cookies format: "auth_token|ct0"
    const [authToken, ct0] = token.split("|");
    return {
      "X-Twitter-Auth-Token": authToken ?? "",
      "X-Twitter-CT0": ct0 ?? "",
    };
  }

  private async req<T>(
    key: string,
    path: string,
    token: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...this.authHeaders(token),
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    this.limiter.observe(key, res.headers);

    if (res.status === 402) {
      throw new Error(
        `xbird x402 payment required for ${key} — ensure operator wallet has USDC on Base mainnet`,
      );
    }
    if (res.status === 429) {
      throw new Error(`xbird ${key} rate limited (429) — retry after delay`);
    }
    if (!res.ok) {
      throw new Error(
        `xbird ${key} failed (${res.status}): ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  }

  async getMe(token: string): Promise<XUser> {
    const json = await this.req<{
      data: {
        id: string;
        username: string;
        name: string;
        tweet_count?: number;
      };
    }>("getMe", "/api/me", token);
    return {
      id: json.data.id,
      username: json.data.username,
      name: json.data.name,
      tweetCount: json.data.tweet_count ?? 0,
    };
  }

  async getUserTweets(
    token: string,
    userId: string,
    max = 50,
  ): Promise<XTweet[]> {
    const now = Date.now();
    const cacheKey = `xbird:tweets:${userId}:${max}`;
    const cached = this.cache.get<XTweet[]>(cacheKey, now);
    if (cached) return cached;

    const json = await this.req<{ data?: RawTweet[] }>(
      "getUserTweets",
      `/api/users/${userId}/tweets?count=${Math.min(max, 100)}`,
      token,
    );
    const tweets = (json.data ?? []).map(toTweet);
    this.cache.set(cacheKey, tweets, now);
    return tweets;
  }

  async getHomeTimeline(
    token: string,
    _userId: string,
    max = 30,
  ): Promise<XTweet[]> {
    const now = Date.now();
    const cacheKey = `xbird:timeline:${max}`;
    const cached = this.cache.get<XTweet[]>(cacheKey, now);
    if (cached) return cached;

    const json = await this.req<{ data?: RawTweet[] }>(
      "getHomeTimeline",
      `/api/timeline/home?count=${Math.min(max, 100)}`,
      token,
    );
    const tweets = (json.data ?? []).map(toTweet);
    this.cache.set(cacheKey, tweets, now);
    return tweets;
  }

  async getPersonalizedTrends(token: string): Promise<XTrend[]> {
    const now = Date.now();
    const cached = this.cache.get<XTrend[]>("xbird:trends", now);
    if (cached) return cached;

    try {
      const json = await this.req<{ data?: RawTrend[] }>(
        "getTrends",
        "/api/news?count=20&trendingOnly=true",
        token,
      );
      const trends = (json.data ?? []).map((t) => ({
        name: t.name,
        postCount: t.tweet_count,
      }));
      this.cache.set("xbird:trends", trends, now);
      return trends;
    } catch {
      // Trends may be unavailable; degrade to none so ACQUIRE can fall back
      // to niche + own tweets for grounding.
      return [];
    }
  }

  async postTweet(token: string, text: string): Promise<PostResult> {
    const json = await this.req<{ data: { id: string; text?: string } }>(
      "postTweet",
      "/api/tweets",
      token,
      { method: "POST", body: JSON.stringify({ text }) },
    );
    return {
      id: json.data.id,
      url: `https://x.com/i/web/status/${json.data.id}`,
    };
  }

  async getTweetMetrics(
    token: string,
    tweetIds: string[],
  ): Promise<Record<string, XTweetMetrics>> {
    if (tweetIds.length === 0) return {};

    const out: Record<string, XTweetMetrics> = {};
    // xbird doesn't have a batch metrics endpoint; fetch individually.
    // Limit to 10 to avoid excessive calls in a single stage.
    for (const id of tweetIds.slice(0, 10)) {
      try {
        const json = await this.req<{
          data?: { public_metrics?: RawMetrics };
        }>("getTweetMetrics", `/api/tweets/${id}`, token);
        if (json.data?.public_metrics) {
          out[id] = toMetrics(json.data.public_metrics);
        }
      } catch {
        // Non-fatal: individual metric fetch failure doesn't block the stage.
      }
    }
    return out;
  }

  /** Expose wait hint for the POST stage's back-off. */
  waitMs(key: string, now: number): number {
    return this.limiter.waitMs(key, now);
  }
}

// --- Response shape helpers ---

interface RawTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: RawMetrics;
}

interface RawMetrics {
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  impression_count?: number;
}

interface RawTrend {
  name: string;
  tweet_count?: number;
}

function toMetrics(m: RawMetrics): XTweetMetrics {
  return {
    likes: m?.like_count ?? 0,
    reposts: m?.retweet_count ?? 0,
    replies: m?.reply_count ?? 0,
    impressions: m?.impression_count ?? 0,
  };
}

function toTweet(t: RawTweet): XTweet {
  return {
    id: t.id,
    text: t.text,
    createdAt: t.created_at ?? new Date(0).toISOString(),
    metrics: t.public_metrics ? toMetrics(t.public_metrics) : undefined,
  };
}
