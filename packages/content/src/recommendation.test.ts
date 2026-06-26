import test from "node:test";
import assert from "node:assert/strict";
import {
  learnPreferences,
  recommendSignals,
  scorePerformance,
} from "./recommendation.js";

test("prioritizes fresh topic-matched signals over generic trends", () => {
  const now = new Date().toISOString();
  const recommendation = recommendSignals({
    timeline: [
      {
        id: "1",
        text: "Founders are replacing dashboards with AI agents for operations.",
        createdAt: now,
      },
      {
        id: "2",
        text: "A generic note about weekend productivity.",
        createdAt: now,
      },
    ],
    trends: [{ name: "celebrity news", postCount: 1_000_000 }],
    topics: ["AI agents", "founders"],
    niche: "AI agents for founders",
  });

  assert.equal(
    recommendation.selectedSignals[0]?.text,
    "Founders are replacing dashboards with AI agents for operations.",
  );
  assert.match(recommendation.selectedSignals[0]?.reasons.join("\n") ?? "", /topic match/);
  assert.ok(recommendation.confidence > 0.5);
});

test("penalizes URLs and near-duplicate recent posts", () => {
  const recommendation = recommendSignals({
    timeline: [
      {
        id: "1",
        text: "AI agents for founders need better operational memory.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        text: "AI agents for founders need better operational memory https://example.com",
        createdAt: new Date().toISOString(),
      },
    ],
    trends: [],
    topics: ["AI agents", "founders"],
    recentPosts: ["AI agents for founders need better operational memory."],
  });

  const duplicate = recommendation.selectedSignals.find((signal) =>
    signal.text.includes("operational memory"),
  );

  assert.ok(duplicate);
  assert.ok(duplicate.score < 6);
  assert.match(duplicate.reasons.join("\n"), /duplicate penalty/);
});

test("filters URL-heavy candidates out of selected signals", () => {
  const recommendation = recommendSignals({
    timeline: [
      {
        id: "1",
        text: "AI agents for founders need better operations https://example.com",
        createdAt: new Date().toISOString(),
      },
    ],
    trends: [],
    topics: ["AI agents", "founders", "operations"],
  });

  assert.equal(
    recommendation.selectedSignals.some((signal) => signal.text.includes("http")),
    false,
  );
});

test("learns high-performing angles from recorded metrics", () => {
  const learned = learnPreferences([
    {
      text: "Founder workflow improves when agents take the boring handoffs.",
      angle: "founder workflow",
      topics: ["AI agents"],
      metrics: {
        impressions: 1000,
        likes: 60,
        replies: 12,
        reposts: 8,
      },
    },
    {
      text: "A quiet product update.",
      angle: "product update",
      topics: ["launch"],
      metrics: {
        impressions: 1000,
        likes: 3,
        replies: 0,
        reposts: 0,
      },
    },
  ]);

  const founderWorkflow = learned.find(
    (preference) => preference.label === "founder workflow",
  );

  assert.ok(founderWorkflow);
  assert.ok(founderWorkflow.score > 0.1);
});

test("uses learned preferences when selecting the next angle", () => {
  const recommendation = recommendSignals({
    timeline: [
      {
        id: "1",
        text: "Agent operators are becoming a founder workflow layer.",
        createdAt: new Date().toISOString(),
      },
    ],
    trends: [],
    topics: ["AI agents"],
    history: [
      {
        text: "Founder workflow improves when agents take the boring handoffs.",
        angle: "founder workflow",
        topics: ["AI agents"],
        metrics: {
          impressions: 1000,
          likes: 80,
          replies: 10,
          reposts: 10,
        },
      },
    ],
  });

  assert.equal(recommendation.angle, "founder workflow");
  assert.match(recommendation.note, /Learned winners/);
});

test("scores engagement with replies and reposts weighted higher than likes", () => {
  assert.equal(
    scorePerformance({
      impressions: 1000,
      likes: 10,
      replies: 5,
      reposts: 2,
    }),
    0.026,
  );
});
