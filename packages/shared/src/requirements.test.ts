import assert from "node:assert/strict";
import test from "node:test";
import {
  A2ADelegationProofSchema,
  A2ADelegationTaskType,
} from "./requirements.js";

test("A2A proof schema accepts Universal Workbench task types", () => {
  const parsed = A2ADelegationProofSchema.parse({
    taskType: A2ADelegationTaskType.ResearchPack,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: "negotiation-1",
    downstreamOrderId: "order-1",
    status: "COMPLETED",
    request: { taskType: "research-pack" },
    response: { delivery: { text: "research delivered" } },
    error: null,
    startedAt: new Date("2026-06-26T00:00:00.000Z").toISOString(),
    paidAt: new Date("2026-06-26T00:01:00.000Z").toISOString(),
    completedAt: new Date("2026-06-26T00:02:00.000Z").toISOString(),
  });

  assert.equal(parsed.taskType, "research-pack");
});

test("A2A proof schema keeps null taskType for legacy rows", () => {
  const parsed = A2ADelegationProofSchema.parse({
    taskType: null,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: null,
    downstreamOrderId: null,
    status: "FAILED",
    request: {},
    response: null,
    error: "failed before migration",
    startedAt: new Date("2026-06-26T00:00:00.000Z").toISOString(),
    paidAt: null,
    completedAt: null,
  });

  assert.equal(parsed.taskType, null);
});
