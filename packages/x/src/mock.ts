import type {
  PostResult,
  XClient,
  XTrend,
  XTweet,
  XTweetMetrics,
  XUser,
} from "./types.js";

/**
 * Deterministic in-memory X adapter. Lets the whole pipeline run end-to-end
 * with zero API cost. Posts are stored so RECORD can read back fake metrics.
 *
 * Determinism note: avoids Math.random/Date.now where it would make tests
 * flaky — ids derive from a monotonic counter.
 */
export class MockXClient implements XClient {
  readonly mode = "mock" as const;

  private counter = 1000;
  private readonly posts = new Map<string, XTweet>();

  constructor(
    private readonly seed: {
      user?: Partial<XUser>;
      timeline?: XTweet[];
      ownTweets?: XTweet[];
      trends?: XTrend[];
    } = {},
  ) {}

  private nextId(): string {
    this.counter += 1;
    return String(this.counter);
  }

  async getMe(): Promise<XUser> {
    return {
      id: this.seed.user?.id ?? "mock-user-1",
      username: this.seed.user?.username ?? "mockuser",
      name: this.seed.user?.name ?? "Mock User",
      tweetCount: this.seed.user?.tweetCount ?? (this.seed.ownTweets?.length ?? 42),
    };
  }

  async getUserTweets(
    _accessToken: string,
    _userId: string,
    max = 50,
  ): Promise<XTweet[]> {
    const base =
      this.seed.ownTweets ??
      Array.from({ length: 12 }, (_, i) => ({
        id: `own-${i}`,
        text: `A past thought #${i} about building in public and shipping fast.`,
        createdAt: new Date(0).toISOString(),
      }));
    return base.slice(0, max);
  }

  async getHomeTimeline(
    _accessToken: string,
    _userId: string,
    max = 30,
  ): Promise<XTweet[]> {
    const base =
      this.seed.timeline ??
      Array.from({ length: 10 }, (_, i) => ({
        id: `tl-${i}`,
        text: `Someone I follow is discussing topic ${i}: AI agents, crypto rails, dev tooling.`,
        createdAt: new Date(0).toISOString(),
      }));
    return base.slice(0, max);
  }

  async getPersonalizedTrends(): Promise<XTrend[]> {
    return (
      this.seed.trends ?? [
        { name: "#BuildInPublic", postCount: 12000 },
        { name: "AI agents", postCount: 48000 },
        { name: "Base L2", postCount: 8000 },
      ]
    );
  }

  async postTweet(_accessToken: string, text: string): Promise<PostResult> {
    const id = this.nextId();
    this.posts.set(id, {
      id,
      text,
      createdAt: new Date(0).toISOString(),
      metrics: { likes: 0, reposts: 0, replies: 0, impressions: 0 },
    });
    return { id, url: `https://x.com/mockuser/status/${id}` };
  }

  async getTweetMetrics(
    _accessToken: string,
    tweetIds: string[],
  ): Promise<Record<string, XTweetMetrics>> {
    const out: Record<string, XTweetMetrics> = {};
    for (const id of tweetIds) {
      // Deterministic pseudo-metrics derived from the id digits.
      const n = Number(id.replace(/\D/g, "")) || 1;
      out[id] = {
        likes: n % 17,
        reposts: n % 5,
        replies: n % 3,
        impressions: (n % 17) * 30,
      };
    }
    return out;
  }
}
