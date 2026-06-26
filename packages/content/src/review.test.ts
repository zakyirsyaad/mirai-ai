import test from "node:test";
import assert from "node:assert/strict";
import { ContentLanguage, type ContentPolicyPayload } from "@mirai/shared";
import { review } from "./review.js";

const basePolicy: ContentPolicyPayload = {
  allowedTopics: [],
  blockedTopics: [],
  blockedPhrases: [],
  language: ContentLanguage.Any,
  toneRules: [],
  formatRules: [],
  requireApprovalFor: [],
};

test("accepts a post that matches allowed topics", () => {
  const verdict = review({
    text: "AI agents are becoming practical teammates for daily shipping.",
    recent: [],
    policy: { ...basePolicy, allowedTopics: ["AI agents"] },
  });

  assert.equal(verdict.ok, true);
});

test("accepts singular and plural token matches for multi-word allowed topics", () => {
  const verdict = review({
    text: "Useful agents help founders move handoffs out of chat and into a workflow.",
    recent: [],
    policy: { ...basePolicy, allowedTopics: ["AI agents", "founder workflows"] },
  });

  assert.equal(verdict.ok, true);
});

test("rejects posts outside the allowed topics", () => {
  const verdict = review({
    text: "A weekend cooking note about better pasta sauce.",
    recent: [],
    policy: { ...basePolicy, allowedTopics: ["AI agents", "startup"] },
  });

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join("\n"), /outside allowed topics/);
});

test("rejects blocked topics, phrases, and approval-only subjects", () => {
  const verdict = review({
    text: "Politics hot take: click here for guaranteed returns.",
    recent: [],
    policy: {
      ...basePolicy,
      blockedTopics: ["politics"],
      blockedPhrases: ["click here"],
      requireApprovalFor: ["guaranteed returns"],
    },
  });

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join("\n"), /blocked topic/);
  assert.match(verdict.reasons.join("\n"), /blocked phrase/);
  assert.match(verdict.reasons.join("\n"), /requires approval/);
});

test("rejects common format rule violations", () => {
  const verdict = review({
    text: "Shipping today #buildinpublic 🚀",
    recent: [],
    policy: {
      ...basePolicy,
      formatRules: ["no hashtags", "no emoji"],
    },
  });

  assert.equal(verdict.ok, false);
  assert.match(verdict.reasons.join("\n"), /no hashtags/);
  assert.match(verdict.reasons.join("\n"), /no emoji/);
});
