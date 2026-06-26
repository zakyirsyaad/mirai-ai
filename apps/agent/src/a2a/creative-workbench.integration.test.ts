import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCreativeWorkbenchRequest,
  mergeSignals,
  type AcquireCreativeWorkbenchSignalsArgs,
} from "./creative-workbench.js";
import { redactA2ASecrets } from "./redaction.js";

test("Creative workbench A2A contract turns delivery into safe grounding", () => {
  const privateCode = ["CAP", "PRIVATE", "CREATIVE", "INT", "12345678"].join(
    "-",
  );
  const args: AcquireCreativeWorkbenchSignalsArgs = {
    campaignId: "campaign-int",
    scheduledPostId: "post-int",
    upstreamCrooOrderId: "order-int",
    topics: ["AI creator agents"],
    niche: "content automation",
    baseSignals: {
      themes: ["creator operations"],
      trends: ["autonomous agents"],
      note: "Need creative assist for campaign copy.",
    },
    voiceProfile: null,
    contentPolicy: { language: "en" },
  };
  const request = buildCreativeWorkbenchRequest(args);
  const delivery = {
    deliverableType: "schema",
    status: "accepted",
    schema: {
      kind: "universal-work-pack",
      packType: "creator-ops",
      answer: `Use concise launch copy. Private code: ${privateCode}`,
    },
  };
  const merged = mergeSignals(args.baseSignals, {
    creativeWorkbenchRequest: request,
    delivery,
  });
  const report = redactA2ASecrets({
    request,
    response: { delivery },
    rawMaterial: merged,
  });

  assert.equal(request.packType, "creator-ops");
  assert.equal(request.track, "creator-content-ops");
  assert.equal(request.taskType, "creative-pack");
  assert.equal(request.language, "en");
  assert.match(merged.note, /Universal Workbench creative-pack/);
  assert.equal(JSON.stringify(report).includes(privateCode), false);
});
