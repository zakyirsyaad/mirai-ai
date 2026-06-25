import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreativeWorkbenchRequest,
  mergeSignals,
  readResponseLanguage,
  type AcquireCreativeWorkbenchSignalsArgs,
} from "./creative-workbench.js";
import { redactA2ASecrets } from "./redaction.js";

const privateCode = ["CAP", "PRIVATE", "CREATIVE", "UNIT", "12345678"].join(
  "-",
);

function baseArgs(
  overrides: Partial<AcquireCreativeWorkbenchSignalsArgs> = {},
): AcquireCreativeWorkbenchSignalsArgs {
  return {
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
    ...overrides,
  };
}

test("buildCreativeWorkbenchRequest creates creator-ops A2A requests", () => {
  const request = buildCreativeWorkbenchRequest(baseArgs());

  assert.equal(request.packType, "creator-ops");
  assert.equal(request.track, "creator-content-ops");
  assert.equal(request.language, "id");
  assert.match(request.prompt, /creator-ops work pack/);
  assert.match(request.prompt, /voice-fit notes/);
  assert.doesNotMatch(request.prompt, /evidence checks/i);
  assert.deepEqual(request.miraiTrace, {
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
  });
});

test("readResponseLanguage defaults to English unless policy language is id", () => {
  assert.equal(readResponseLanguage({ language: "id" }), "id");
  assert.equal(readResponseLanguage({ language: "en" }), "en");
  assert.equal(readResponseLanguage(null), "en");
});

test("mergeSignals appends downstream A2A evidence without dropping base signals", () => {
  const merged = mergeSignals(baseArgs().baseSignals, {
    delivery: { text: "Creator-ops pack delivered." },
  });

  assert.deepEqual(merged.themes, [
    "creator workflow",
    "downstream creative workbench",
    "A2A creator-ops pack",
  ]);
  assert.deepEqual(merged.trends, ["AI agents"]);
  assert.match(merged.note, /A2A creative workbench delivery/);
});

test("redactA2ASecrets removes private downstream codes from nested reports", () => {
  const redacted = redactA2ASecrets({
    text: `Private code: ${privateCode}`,
    nested: [`code ${privateCode}`],
  });

  assert.deepEqual(redacted, {
    text: "Private code: [redacted-code]",
    nested: ["code [redacted-code]"],
  });
});
