import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  buildCreativeWorkbenchRequest,
  mergeSignals,
} from "../dist/a2a/creative-workbench.js";
import { redactA2ASecrets } from "../dist/a2a/redaction.js";

const iterations = Number.parseInt(process.env.MIRAI_PERF_ITERATIONS ?? "10000", 10);
const maxMs = Number.parseInt(process.env.MIRAI_PERF_MAX_MS ?? "3000", 10);
const args = {
  campaignId: "campaign-perf",
  scheduledPostId: "post-perf",
  upstreamCrooOrderId: "order-perf",
  topics: ["AI creator agents", "content ops", "social workflow"],
  niche: "autonomous X content",
  baseSignals: {
    themes: ["creator workflow", "campaign planning"],
    trends: ["AI agents", "content automation"],
    note: "Need creative A2A support for a campaign.",
  },
  voiceProfile: null,
  contentPolicy: { language: "en" },
};

const code = ["CAP", "PRIVATE", "CREATIVE", "PERF", "12345678"].join("-");
const startedAt = performance.now();
for (let i = 0; i < iterations; i += 1) {
  const request = buildCreativeWorkbenchRequest(args);
  const merged = mergeSignals(args.baseSignals, {
    result: { text: `iteration ${i} Private code: ${code}` },
  });
  const redacted = redactA2ASecrets({ request, merged });
  assert.equal(JSON.stringify(redacted).includes(code), false);
}
const durationMs = performance.now() - startedAt;
assert.ok(
  durationMs <= maxMs,
  `A2A contract helpers exceeded ${maxMs}ms: ${durationMs.toFixed(2)}ms`,
);

console.log(
  JSON.stringify(
    {
      ok: true,
      iterations,
      durationMs: Number(durationMs.toFixed(2)),
      maxMs,
    },
    null,
    2,
  ),
);
