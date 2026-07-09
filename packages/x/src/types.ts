/**
 * X (Twitter) API surface used by mirai-ai, abstracted behind `XClient`.
 *
 * We deliberately use a narrow interface: one write (post a tweet) and a few
 * "owned reads" (the hirer's own timeline / tweets / trends, billed at the
 * cheap $0.001/resource owned-read rate). Both a real and a mock implementation
 * satisfy it, chosen by `X_MODE`.
 */

export interface XTokens {
  accessToken: string;
  refreshToken: string;
  scope: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

export interface XUser {
  id: string;
  username: string;
  name: string;
  tweetCount: number;
}

export interface XTweet {
  id: string;
  text: string;
  createdAt: string;
  metrics?: XTweetMetrics;
}

export interface XTweetMetrics {
  likes: number;
  reposts: number;
  replies: number;
  impressions: number;
}

export interface XTrend {
  name: string;
  postCount?: number;
}

export interface PostResult {
  id: string;
  url: string;
}

/**
 * Narrow client interface. `accessToken` is passed per-call so the caller
 * (which owns token storage + refresh) stays in control of credentials.
 */
export interface XClient {
  readonly mode: "mock" | "real" | "scraper";

  /** Identify the authenticated user (also yields tweetCount for cold-start). */
  getMe(accessToken: string): Promise<XUser>;

  /** Owned read: the user's own recent tweets (for voice + dedupe). */
  getUserTweets(
    accessToken: string,
    userId: string,
    max?: number,
  ): Promise<XTweet[]>;

  /** Owned read: reverse-chronological home timeline (AUTONOMOUS grounding). */
  getHomeTimeline(
    accessToken: string,
    userId: string,
    max?: number,
  ): Promise<XTweet[]>;

  /** Owned read: personalized trends (AUTONOMOUS grounding). */
  getPersonalizedTrends(accessToken: string): Promise<XTrend[]>;

  /** Write: publish a plain-text tweet. Avoid URLs (13× cost). */
  postTweet(accessToken: string, text: string): Promise<PostResult>;

  /** Owned read: fetch engagement metrics for posted tweets. */
  getTweetMetrics(
    accessToken: string,
    tweetIds: string[],
  ): Promise<Record<string, XTweetMetrics>>;
}
