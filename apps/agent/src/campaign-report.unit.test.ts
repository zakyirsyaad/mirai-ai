import test from "node:test";
import assert from "node:assert/strict";
import { PostStage } from "@mirai/db";
import { buildContentAgentDeliverable } from "./campaign-report.js";

const baseCampaign = {
  id: "campaign-report",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  accessExpiresAt: new Date("2026-06-08T00:00:00.000Z"),
  order: {
    crooOrderId: "croo-order-report",
    negotiationId: "negotiation-report",
    status: "DELIVERED" as const,
    service: "content-agent-7d",
    deliveredAt: new Date("2026-06-01T00:00:30.000Z"),
  },
  session: {
    xConnection: { xHandle: "mirai_test" },
  },
  a2aDelegations: [
    {
      id: "delegation-1",
      scheduledPostId: "scheduled-post-1",
      upstreamCrooOrderId: "croo-order-report",
      taskType: "creative-pack",
      downstreamAgent: "Universal Workbench AI Agent",
      downstreamServiceId: "workbench-service",
      downstreamNegotiationId: "downstream-negotiation",
      downstreamOrderId: "downstream-order",
      status: "COMPLETED" as const,
      requestJson: { task: "creative-pack" },
      responseJson: { delivery: { text: "creative output" } },
      error: null,
      startedAt: new Date("2026-06-01T00:01:00.000Z"),
      paidAt: new Date("2026-06-01T00:02:00.000Z"),
      completedAt: new Date("2026-06-01T00:03:00.000Z"),
    },
  ],
};

test("campaign report surfaces recommendation metadata and learning summary", () => {
  const rawMaterial = JSON.stringify({
    kind: "autonomous",
    signals: {
      angle: "founder workflow",
      confidence: 0.82,
      selectedSignals: [
        {
          text: "Agent operators are becoming a founder workflow layer.",
          source: "timeline",
          score: 9.4,
          reasons: ["topic match", "learned winner"],
        },
      ],
      learnedPreferences: [
        {
          label: "founder workflow",
          score: 0.13,
          evidence: 2,
        },
      ],
    },
    draftTournament: {
      variantCount: 5,
      winner: {
        text: "Founders are moving from dashboards to delegated agent workflows.",
        style: "practical-takeaway",
        score: 31,
        ok: true,
        reasons: ["passed policy review", "topic/angle match"],
        reviewReasons: [],
      },
      candidates: [
        {
          text: "Founders are moving from dashboards to delegated agent workflows.",
          style: "practical-takeaway",
          score: 31,
          ok: true,
          reasons: ["passed policy review", "topic/angle match"],
          reviewReasons: [],
        },
        {
          text: "Stay tuned, the future is here.",
          style: "one-liner",
          score: 4,
          ok: false,
          reasons: ["generic phrasing penalty"],
          reviewReasons: ["outside allowed topics: AI agents"],
        },
      ],
    },
  });

  const report = buildContentAgentDeliverable(
    {
      ...baseCampaign,
      scheduledPosts: [
        {
          scheduledFor: new Date("2026-06-02T00:00:00.000Z"),
          postedAt: new Date("2026-06-02T00:01:00.000Z"),
          tweetId: "tweet-1",
          tweetUrl: "https://x.com/mirai_test/status/tweet-1",
          draftText:
            "Founders are moving from dashboards to delegated agent workflows.",
          angle: "founder workflow",
          stage: PostStage.RECORDED,
          rawMaterial,
          metrics: {
            likes: 80,
            replies: 10,
            reposts: 10,
            impressions: 1000,
            performanceScore: 0.13,
          },
        },
      ],
    },
    () => null,
  );

  assert.equal(report.learning.bestAngles[0]?.angle, "founder workflow");
  assert.equal(report.learning.learnedPreferences[0]?.label, "founder workflow");
  assert.match(report.learning.summary, /founder workflow/);
  assert.equal(report.posts[0]?.recommendation?.confidence, 0.82);
  assert.equal(
    report.posts[0]?.recommendation?.selectedSignals[0]?.reasons.includes(
      "learned winner",
    ),
    true,
  );
  assert.equal(report.posts[0]?.metrics?.performanceScore, 0.13);
  assert.equal(report.posts[0]?.draftTournament?.variantCount, 5);
  assert.equal(
    report.posts[0]?.draftTournament?.winner.style,
    "practical-takeaway",
  );
  assert.equal(report.posts[0]?.draftTournament?.candidates.length, 2);
  assert.equal(report.capProof.upstreamCrooOrderId, "croo-order-report");
  assert.equal(report.capProof.orderStatus, "DELIVERED");
  assert.equal(report.a2aSummary.total, 1);
  assert.equal(report.a2aSummary.completed, 1);
  assert.equal(report.a2aSummary.downstreamOrders, 1);
  assert.equal(report.a2aDelegations[0]?.delegationId, "delegation-1");
  assert.equal(report.a2aDelegations[0]?.scheduledPostId, "scheduled-post-1");
  assert.equal(
    report.a2aDelegations[0]?.upstreamCrooOrderId,
    "croo-order-report",
  );
});

test("campaign report computes performance score for legacy metrics", () => {
  const report = buildContentAgentDeliverable(
    {
      ...baseCampaign,
      scheduledPosts: [
        {
          scheduledFor: new Date("2026-06-02T00:00:00.000Z"),
          postedAt: new Date("2026-06-02T00:01:00.000Z"),
          tweetId: "tweet-2",
          tweetUrl: "https://x.com/mirai_test/status/tweet-2",
          draftText: "A concise launch note.",
          angle: "launch note",
          stage: PostStage.RECORDED,
          metrics: {
            likes: 10,
            replies: 5,
            reposts: 2,
            impressions: 1000,
          },
        },
      ],
    },
    () => null,
  );

  assert.equal(report.posts[0]?.metrics?.performanceScore, 0.026);
  assert.equal(report.learning.bestAngles[0]?.angle, "launch note");
});

test("campaign report tolerates malformed rawMaterial", () => {
  const report = buildContentAgentDeliverable(
    {
      ...baseCampaign,
      scheduledPosts: [
        {
          scheduledFor: new Date("2026-06-02T00:00:00.000Z"),
          stage: PostStage.SKIPPED,
          draftText: "",
          rawMaterial: "{not-json",
        },
      ],
    },
    () => null,
  );

  assert.equal(report.posts[0]?.recommendation, undefined);
  assert.match(report.learning.summary, /Not enough recorded engagement/);
});
