import type {
  PostResult,
  XClient,
  XTrend,
  XTweet,
  XTweetMetrics,
  XUser,
} from "./types.js";
import { RateLimiter, ReadCache } from "./ratelimit.js";

const API_BASE = "https://api.twitter.com/2";

/**
 * Real X adapter. Uses Bearer access tokens (per-call) against the v2 API.
 *
 * Cost-aware by design:
 *  - writes default to plain text (URLs cost 13× more);
 *  - reads are owned reads ($0.001/resource) and cached 24h to match X's
 *    dedupe billing window.
 */
export class RealXClient implements XClient {
  readonly mode = "real" as const;

  private readonly limiter = new RateLimiter();
  private readonly cache = new ReadCache();

  private async req<T>(
    key: string,
    path: string,
    accessToken: string,
    init?: RequestInit,
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    this.limiter.observe(key, res.headers);
    if (!res.ok) {
      throw new Error(`X ${key} failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async getMe(accessToken: string): Promise<XUser> {
    const json = await this.req<{
      data: {
        id: string;
        username: string;
        name: string;
        public_metrics?: { tweet_count: number };
      };
    }>("getMe", "/users/me?user.fields=public_metrics", accessToken);
    return {
      id: json.data.id,
      username: json.data.username,
      name: json.data.name,
      tweetCount: json.data.public_metrics?.tweet_count ?? 0,
    };
  }

  async getUserTweets(
    accessToken: string,
    userId: string,
    max = 50,
  ): Promise<XTweet[]> {
    const now = Date.now();
    const cacheKey = `tweets:${userId}:${max}`;
    const cached = this.cache.get<XTweet[]>(cacheKey, now);
    if (cached) return cached;
    const json = await this.req<{ data?: RawTweet[] }>(
      "getUserTweets",
      `/users/${userId}/tweets?max_results=${Math.min(max, 100)}&tweet.fields=created_at,public_metrics`,
      accessToken,
    );
    const tweets = (json.data ?? []).map(toTweet);
    this.cache.set(cacheKey, tweets, now);
    return tweets;
  }

  async getHomeTimeline(
    accessToken: string,
    userId: string,
    max = 30,
  ): Promise<XTweet[]> {
    const now = Date.now();
    const cacheKey = `timeline:${userId}:${max}`;
    const cached = this.cache.get<XTweet[]>(cacheKey, now);
    if (cached) return cached;
    const json = await this.req<{ data?: RawTweet[] }>(
      "getHomeTimeline",
      `/users/${userId}/timelines/reverse_chronological?max_results=${Math.min(max, 100)}&tweet.fields=created_at`,
      accessToken,
    );
    const tweets = (json.data ?? []).map(toTweet);
    this.cache.set(cacheKey, tweets, now);
    return tweets;
  }

  async getPersonalizedTrends(accessToken: string): Promise<XTrend[]> {
    const now = Date.now();
    const cached = this.cache.get<XTrend[]>("trends", now);
    if (cached) return cached;
    try {
      const json = await this.req<{
        data?: { trend_name: string; post_count?: number }[];
      }>("getTrends", "/users/personalized_trends", accessToken);
      const trends = (json.data ?? []).map((t) => ({
        name: t.trend_name,
        postCount: t.post_count,
      }));
      this.cache.set("trends", trends, now);
      return trends;
    } catch {
      // personalized_trends may be unavailable on pay-per-use; degrade to none
      // so ACQUIRE can fall back to niche + own tweets for grounding.
      return [];
    }
  }

  async postTweet(accessToken: string, text: string): Promise<PostResult> {
    const json = await this.req<{ data: { id: string } }>(
      "postTweet",
      "/tweets",
      accessToken,
      { method: "POST", body: JSON.stringify({ text }) },
    );
    return {
      id: json.data.id,
      url: `https://x.com/i/web/status/${json.data.id}`,
    };
  }

  async getTweetMetrics(
    accessToken: string,
    tweetIds: string[],
  ): Promise<Record<string, XTweetMetrics>> {
    if (tweetIds.length === 0) return {};
    const ids = tweetIds.slice(0, 100).join(",");
    const json = await this.req<{ data?: RawTweet[] }>(
      "getTweetMetrics",
      `/tweets?ids=${ids}&tweet.fields=public_metrics`,
      accessToken,
    );
    const out: Record<string, XTweetMetrics> = {};
    for (const t of json.data ?? []) {
      out[t.id] = toMetrics(t.public_metrics);
    }
    return out;
  }

  /** Expose wait hint for the POST stage's back-off. */
  waitMs(key: string, now: number): number {
    return this.limiter.waitMs(key, now);
  }
}

interface RawTweet {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    impression_count?: number;
  };
}

function toMetrics(m: RawTweet["public_metrics"]): XTweetMetrics {
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
