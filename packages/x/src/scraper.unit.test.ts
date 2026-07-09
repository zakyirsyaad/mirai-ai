import test from "node:test";
import assert from "node:assert/strict";

const BASE_URL = "https://xbirdapi.test.local";

// Save original fetch and shared state
const originalFetch = globalThis.fetch;
const fetchCalls: { url: string; init?: RequestInit }[] = [];
let mockStatus = 200;
let mockBody: unknown = {};

function installMock() {
  fetchCalls.length = 0;
  mockStatus = 200;
  mockBody = {};
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init });
    return new Response(JSON.stringify(mockBody), {
      status: mockStatus,
      headers: { "content-type": "application/json" },
    });
  };
}

function uninstallMock() {
  globalThis.fetch = originalFetch;
}

// Install mock before importing ScraperXClient
installMock();
const { ScraperXClient } = await import("./scraper.js");

// --- Tests ---

test("ScraperXClient has scraper mode", () => {
  installMock();
  const client = new ScraperXClient(BASE_URL);
  assert.equal(client.mode, "scraper");
  uninstallMock();
});

test("getMe returns mapped XUser", async () => {
  installMock();
  mockBody = {
    data: {
      id: "12345",
      username: "testuser",
      name: "Test User",
      tweet_count: 42,
    },
  };
  const client = new ScraperXClient(BASE_URL);
  const user = await client.getMe("xbird_sk_test");

  assert.equal(user.id, "12345");
  assert.equal(user.username, "testuser");
  assert.equal(user.name, "Test User");
  assert.equal(user.tweetCount, 42);
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0]!.url.includes("/api/me"));
  assert.equal(
    (fetchCalls[0]!.init?.headers as Record<string, string>)[
      "X-Encryption-Key"
    ],
    "xbird_sk_test",
  );
  uninstallMock();
});

test("getMe defaults tweetCount to 0 when missing", async () => {
  installMock();
  mockBody = {
    data: { id: "1", username: "u", name: "n" },
  };
  const client = new ScraperXClient(BASE_URL);
  const user = await client.getMe("token");
  assert.equal(user.tweetCount, 0);
  uninstallMock();
});

test("getHomeTimeline maps tweets correctly", async () => {
  installMock();
  mockBody = {
    data: [
      {
        id: "100",
        text: "Hello world",
        created_at: "2026-01-15T10:00:00Z",
        public_metrics: {
          like_count: 5,
          retweet_count: 2,
          reply_count: 1,
          impression_count: 100,
        },
      },
      {
        id: "101",
        text: "Second tweet",
        created_at: "2026-01-15T11:00:00Z",
      },
    ],
  };
  const client = new ScraperXClient(BASE_URL);
  const tweets = await client.getHomeTimeline("token", "userId", 10);

  assert.equal(tweets.length, 2);
  const t0 = tweets[0]!;
  const t1 = tweets[1]!;
  assert.equal(t0.id, "100");
  assert.equal(t0.text, "Hello world");
  assert.equal(t0.metrics?.likes, 5);
  assert.equal(t0.metrics?.reposts, 2);
  assert.equal(t0.metrics?.replies, 1);
  assert.equal(t0.metrics?.impressions, 100);
  assert.equal(t1.id, "101");
  assert.equal(t1.metrics, undefined);
  assert.ok(fetchCalls[0]!.url.includes("/api/timeline/home?count=10"));
  uninstallMock();
});

test("getHomeTimeline returns empty array on missing data", async () => {
  installMock();
  mockBody = {};
  const client = new ScraperXClient(BASE_URL);
  const tweets = await client.getHomeTimeline("token", "userId");
  assert.equal(tweets.length, 0);
  uninstallMock();
});

test("getPersonalizedTrends maps trends correctly", async () => {
  installMock();
  mockBody = {
    data: [
      { name: "#BuildInPublic", tweet_count: 12000 },
      { name: "AI agents" },
    ],
  };
  const client = new ScraperXClient(BASE_URL);
  const trends = await client.getPersonalizedTrends("token");

  assert.equal(trends.length, 2);
  const trend0 = trends[0]!;
  const trend1 = trends[1]!;
  assert.equal(trend0.name, "#BuildInPublic");
  assert.equal(trend0.postCount, 12000);
  assert.equal(trend1.name, "AI agents");
  assert.equal(trend1.postCount, undefined);
  assert.ok(fetchCalls[0]!.url.includes("/api/news"));
  assert.ok(fetchCalls[0]!.url.includes("trendingOnly=true"));
  uninstallMock();
});

test("getPersonalizedTrends degrades to [] on error", async () => {
  installMock();
  mockStatus = 500;
  mockBody = { error: "server error" };
  const client = new ScraperXClient(BASE_URL);
  const trends = await client.getPersonalizedTrends("token");
  assert.equal(trends.length, 0);
  uninstallMock();
});

test("postTweet returns PostResult with url", async () => {
  installMock();
  mockBody = { data: { id: "999", text: "posted" } };
  const client = new ScraperXClient(BASE_URL);
  const result = await client.postTweet("token", "Hello!");

  assert.equal(result.id, "999");
  assert.equal(result.url, "https://x.com/i/web/status/999");
  assert.equal(fetchCalls[0]!.init?.method, "POST");
  assert.equal(
    JSON.parse(fetchCalls[0]!.init?.body as string).text,
    "Hello!",
  );
  uninstallMock();
});

test("getTweetMetrics aggregates per-tweet metrics", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    fetchCalls.push({ url: "mock" });
    callCount++;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          data: {
            public_metrics: {
              like_count: 10,
              retweet_count: 3,
              reply_count: 2,
              impression_count: 200,
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        data: {
          public_metrics: {
            like_count: 1,
            retweet_count: 0,
            reply_count: 0,
            impression_count: 10,
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new ScraperXClient(BASE_URL);
  const metrics = await client.getTweetMetrics("token", ["t1", "t2"]);

  assert.equal(Object.keys(metrics).length, 2);
  assert.equal(metrics["t1"]!.likes, 10);
  assert.equal(metrics["t1"]!.reposts, 3);
  assert.equal(metrics["t2"]!.likes, 1);
  assert.equal(metrics["t2"]!.impressions, 10);
  uninstallMock();
});

test("getTweetMetrics returns empty on empty input", async () => {
  installMock();
  const client = new ScraperXClient(BASE_URL);
  const metrics = await client.getTweetMetrics("token", []);
  assert.deepEqual(metrics, {});
  assert.equal(fetchCalls.length, 0);
  uninstallMock();
});

test("getTweetMetrics skips failed individual fetches", async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    fetchCalls.push({ url: "mock" });
    callCount++;
    if (callCount === 1) {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        data: {
          public_metrics: {
            like_count: 5,
            retweet_count: 1,
            reply_count: 0,
            impression_count: 50,
          },
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  const client = new ScraperXClient(BASE_URL);
  const metrics = await client.getTweetMetrics("token", ["bad", "good"]);

  assert.equal(Object.keys(metrics).length, 1);
  assert.equal(metrics["good"]!.likes, 5);
  uninstallMock();
});

test("throws on 402 payment required", async () => {
  installMock();
  mockStatus = 402;
  mockBody = { error: "payment required" };
  const client = new ScraperXClient(BASE_URL);
  await assert.rejects(
    () => client.getMe("token"),
    (err: Error) => {
      assert.ok(err.message.includes("x402"));
      return true;
    },
  );
  uninstallMock();
});

test("throws on 429 rate limit", async () => {
  installMock();
  mockStatus = 429;
  mockBody = { error: "rate limited" };
  const client = new ScraperXClient(BASE_URL);
  await assert.rejects(
    () => client.getMe("token"),
    (err: Error) => {
      assert.ok(err.message.includes("429"));
      return true;
    },
  );
  uninstallMock();
});

test("throws on generic error", async () => {
  installMock();
  mockStatus = 500;
  mockBody = { error: "internal" };
  const client = new ScraperXClient(BASE_URL);
  await assert.rejects(
    () => client.getMe("token"),
    (err: Error) => {
      assert.ok(err.message.includes("500"));
      return true;
    },
  );
  uninstallMock();
});

test("getUserTweets caches results", async () => {
  installMock();
  mockBody = { data: [{ id: "1", text: "cached tweet" }] };
  const client = new ScraperXClient(BASE_URL);

  const first = await client.getUserTweets("token", "123", 10);
  const second = await client.getUserTweets("token", "123", 10);

  assert.equal(first.length, 1);
  assert.deepEqual(first, second);
  assert.equal(fetchCalls.length, 1); // only one fetch due to cache
  uninstallMock();
});
