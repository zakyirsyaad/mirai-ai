import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  parseSafetyDecision,
  readResponseLanguage,
  type UniversalWorkbenchArgs,
} from "./workbench-types.js";

function baseArgs(
  taskType: A2ADelegationTaskType = A2ADelegationTaskType.ResearchPack,
): UniversalWorkbenchArgs {
  return {
    taskType,
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents", "content ops"],
    niche: "autonomous X content",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Users want durable creator-agent workflows.",
    },
    voiceProfile: {
      tone: "sharp",
      topics: ["AI agents"],
      styleNotes: ["specific"],
      doNots: ["no unsupported claims"],
    },
    contentPolicy: { language: "id" },
  };
}

test("buildUniversalWorkbenchRequest creates distinct research, creative, and safety tasks", () => {
  const research = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.ResearchPack),
  );
  const creative = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.CreativePack),
  );
  const safety = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.SafetyPack),
  );

  assert.equal(research.taskType, "research-pack");
  assert.equal(creative.taskType, "creative-pack");
  assert.equal(safety.taskType, "safety-pack");
  assert.match(research.prompt, /source\/context pack/i);
  assert.match(creative.prompt, /campaign angles/i);
  assert.match(safety.prompt, /PASS, WARN, or BLOCK/i);
  assert.equal(research.language, "id");
});

test("mergeWorkbenchOutputs keeps base signals and labels all completed work", () => {
  const merged = mergeWorkbenchOutputs(baseArgs().baseSignals, [
    {
      taskType: "research-pack",
      response: { delivery: { text: "Research pack delivered." } },
    },
    {
      taskType: "creative-pack",
      response: { delivery: { text: "Creative pack delivered." } },
    },
  ]);

  assert.deepEqual(merged.themes, [
    "creator workflow",
    "Universal Workbench research-pack",
    "Universal Workbench creative-pack",
  ]);
  assert.match(merged.note, /Universal Workbench research-pack delivery/);
  assert.match(merged.note, /Universal Workbench creative-pack delivery/);
});

test("parseSafetyDecision reads structured and unstructured safety output", () => {
  assert.deepEqual(parseSafetyDecision({ verdict: "BLOCK", reason: "URL risk" }), {
    verdict: "BLOCK",
    reason: "URL risk",
  });
  assert.deepEqual(parseSafetyDecision({ verdict: "PASS" }), {
    verdict: "PASS",
    reason: null,
  });
  assert.deepEqual(parseSafetyDecision("looks risky but not blocked"), {
    verdict: "WARN",
    reason: "looks risky but not blocked",
  });
});

test("readResponseLanguage defaults to English unless policy language is id", () => {
  assert.equal(readResponseLanguage({ language: "id" }), "id");
  assert.equal(readResponseLanguage({ language: "en" }), "en");
  assert.equal(readResponseLanguage(null), "en");
});
