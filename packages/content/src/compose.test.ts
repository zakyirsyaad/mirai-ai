import test from "node:test";
import assert from "node:assert/strict";
import { ContentLanguage, type ContentPolicyPayload } from "@mirai/shared";
import { writeVariants } from "./compose.js";
import type { Llm } from "./llm.js";

const basePolicy: ContentPolicyPayload = {
  allowedTopics: ["AI agents"],
  blockedTopics: [],
  blockedPhrases: [],
  language: ContentLanguage.Any,
  toneRules: [],
  formatRules: [],
  requireApprovalFor: [],
};

test("writeVariants generates five styled draft variants by default", async () => {
  const prompts: string[] = [];
  const fakeLlm: Llm = {
    kind: "mock",
    async complete(args) {
      prompts.push(args.prompt);
      return `Draft ${prompts.length} about AI agents for founders.`;
    },
  };

  const variants = await writeVariants(
    fakeLlm,
    {
      angle: "founder workflows",
      policy: basePolicy,
    },
    {
      tone: "direct",
      topics: ["AI agents"],
      styleNotes: ["clear"],
      doNots: [],
      sampleVoice: "",
    },
  );

  assert.equal(variants.length, 5);
  assert.equal(new Set(variants.map((variant) => variant.style)).size, 5);
  assert.equal(prompts.every((prompt) => prompt.includes("Variant style:")), true);
});
