import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationStatus } from "@mirai/db";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  runUniversalWorkbenchTask,
  type UniversalWorkbenchDelegation,
  type UniversalWorkbenchStore,
} from "./universal-workbench.js";
import type { UniversalWorkbenchArgs } from "./workbench-types.js";

function args(): UniversalWorkbenchArgs {
  return {
    taskType: A2ADelegationTaskType.ResearchPack,
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents"],
    niche: "creator ops",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Need context.",
    },
    voiceProfile: null,
    contentPolicy: { language: "en" },
  };
}

function memoryStore(): UniversalWorkbenchStore {
  let row: UniversalWorkbenchDelegation | null = null;
  return {
    async findCompleted() {
      return row?.status === A2ADelegationStatus.COMPLETED ? row : null;
    },
    async findLatest() {
      return row;
    },
    async create(input) {
      row = {
        id: "delegation-1",
        campaignId: input.campaignId,
        scheduledPostId: input.scheduledPostId,
        upstreamCrooOrderId: input.upstreamCrooOrderId,
        taskType: input.taskType,
        downstreamAgent: input.downstreamAgent,
        downstreamServiceId: input.downstreamServiceId,
        downstreamNegotiationId: null,
        downstreamOrderId: null,
        status: A2ADelegationStatus.NEGOTIATING,
        requestJson: input.requestJson,
        responseJson: null,
        error: null,
        paidAt: null,
        completedAt: null,
      };
      return row;
    },
    async update(id, data) {
      assert.equal(id, "delegation-1");
      row = { ...(row as UniversalWorkbenchDelegation), ...data };
      return row;
    },
  };
}

test("runUniversalWorkbenchTask negotiates, pays, polls, and stores task response", async () => {
  const calls: string[] = [];
  const result = await runUniversalWorkbenchTask(args(), {
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    store: memoryStore(),
    croo: {
      async negotiateOrder() {
        calls.push("negotiateOrder");
        return { negotiationId: "negotiation-1", status: "created" };
      },
      async findRequesterOrderByNegotiation() {
        calls.push("findRequesterOrderByNegotiation");
        return { orderId: "order-1", status: "created" };
      },
      async payOrder() {
        calls.push("payOrder");
        return { txHash: "0xpay", order: { orderId: "order-1", status: "paid" } };
      },
      async getOrder() {
        calls.push("getOrder");
        return { orderId: "order-1", status: "completed" };
      },
      async getDelivery() {
        calls.push("getDelivery");
        return {
          deliverableType: "schema",
          deliverableSchema: JSON.stringify({ verdict: "PASS" }),
          deliverableText: "",
          status: "accepted",
        };
      },
    },
    sleepMs: async () => {},
    now: () => new Date("2026-06-26T00:00:00.000Z"),
  });

  assert.deepEqual(calls, [
    "negotiateOrder",
    "findRequesterOrderByNegotiation",
    "payOrder",
    "getOrder",
    "getDelivery",
  ]);
  assert.equal(result.taskType, "research-pack");
  assert.equal(result.delegation.status, A2ADelegationStatus.COMPLETED);
});

test("runUniversalWorkbenchTask reuses completed task delegations", async () => {
  const completed: UniversalWorkbenchDelegation = {
    id: "delegation-1",
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    taskType: A2ADelegationTaskType.ResearchPack,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: "negotiation-1",
    downstreamOrderId: "order-1",
    status: A2ADelegationStatus.COMPLETED,
    requestJson: {},
    responseJson: { delivery: { text: "already done" } },
    error: null,
    paidAt: new Date("2026-06-26T00:00:00.000Z"),
    completedAt: new Date("2026-06-26T00:01:00.000Z"),
  };

  const result = await runUniversalWorkbenchTask(args(), {
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    store: {
      async findCompleted() {
        return completed;
      },
      async findLatest() {
        return completed;
      },
      async create() {
        throw new Error("create should not run");
      },
      async update() {
        throw new Error("update should not run");
      },
    },
    croo: {
      async negotiateOrder() {
        throw new Error("negotiate should not run");
      },
      async findRequesterOrderByNegotiation() {
        throw new Error("find should not run");
      },
      async payOrder() {
        throw new Error("pay should not run");
      },
      async getOrder() {
        throw new Error("getOrder should not run");
      },
      async getDelivery() {
        throw new Error("getDelivery should not run");
      },
    },
    sleepMs: async () => {},
    now: () => new Date("2026-06-26T00:00:00.000Z"),
  });

  assert.equal(result.reused, true);
  assert.equal(result.response, completed.responseJson);
});
