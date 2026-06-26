import test from "node:test";
import assert from "node:assert/strict";
import { ContentLanguage, type ContentPolicyPayload } from "@mirai/shared";
import { runDraftTournament } from "./draft-tournament.js";

const basePolicy: ContentPolicyPayload = {
  allowedTopics: [],
  blockedTopics: [],
  blockedPhrases: [],
  language: ContentLanguage.Any,
  toneRules: [],
  formatRules: [],
  requireApprovalFor: [],
};

test("draft tournament picks the strongest policy-safe topical draft", () => {
  const result = runDraftTournament({
    drafts: [
      {
        style: "one-liner",
        text: "Stay tuned, the future is here.",
      },
      {
        style: "practical-takeaway",
        text: "AI agents become useful when they remove founder handoffs, not when they add another dashboard to babysit.",
      },
      {
        style: "contrarian-take",
        text: "A cooking note about better pasta sauce.",
      },
    ],
    recent: [],
    policy: { ...basePolicy, allowedTopics: ["AI agents", "founder"] },
    topics: ["AI agents", "founder workflows"],
    angle: "founder workflows",
  });

  assert.equal(
    result.winner.text,
    "AI agents become useful when they remove founder handoffs, not when they add another dashboard to babysit.",
  );
  assert.equal(result.winner.ok, true);
  assert.match(result.winner.reasons.join("\n"), /topic\/angle match/);
  assert.equal(result.variantCount, 3);
});

test("draft tournament penalizes URL and duplicate drafts", () => {
  const result = runDraftTournament({
    drafts: [
      {
        style: "concise-insight",
        text: "AI agents for founders need better operational memory https://example.com",
      },
      {
        style: "mini-story",
        text: "AI agents for founders need better operational memory.",
      },
      {
        style: "practical-takeaway",
        text: "Founder workflows improve when agents remember the handoff and return with finished work.",
      },
    ],
    recent: ["AI agents for founders need better operational memory."],
    topics: ["AI agents", "founder workflows"],
  });

  assert.equal(
    result.winner.text,
    "Founder workflows improve when agents remember the handoff and return with finished work.",
  );
  assert.equal(
    result.candidates.some(
      (candidate) =>
        candidate.text.includes("https://") && candidate.score > result.winner.score,
    ),
    false,
  );
});

test("draft tournament still returns a winner when every draft fails review", () => {
  const result = runDraftTournament({
    drafts: [
      {
        style: "concise-insight",
        text: "https://example.com",
      },
      {
        style: "one-liner",
        text: "",
      },
    ],
    recent: [],
  });

  assert.equal(result.variantCount, 2);
  assert.equal(result.winner.ok, false);
  assert.ok(result.winner.reviewReasons.length > 0);
});
