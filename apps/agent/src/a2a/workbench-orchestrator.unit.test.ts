import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationStatus } from "@mirai/db";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  orchestrateUniversalWorkbench,
  type WorkbenchTaskRunner,
} from "./workbench-orchestrator.js";
import type { UniversalWorkbenchArgs } from "./workbench-types.js";

function baseArgs(): Omit<UniversalWorkbenchArgs, "taskType"> {
  return {
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents"],
    niche: "creator ops",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Need campaign help.",
    },
    voiceProfile: null,
    contentPolicy: { language: "en" },
  };
}

test("orchestrateUniversalWorkbench runs research, creative, and safety in order", async () => {
  const calls: string[] = [];
  const runner: WorkbenchTaskRunner = async (args) => {
    calls.push(args.taskType);
    return {
      taskType: args.taskType,
      request: { taskType: args.taskType },
      response:
        args.taskType === A2ADelegationTaskType.SafetyPack
          ? { delivery: { text: { verdict: "PASS" } } }
          : { delivery: { text: `${args.taskType} delivered` } },
      delegation: {
        id: `${args.taskType}-delegation`,
        campaignId: args.campaignId,
        scheduledPostId: args.scheduledPostId,
        upstreamCrooOrderId: args.upstreamCrooOrderId,
        taskType: args.taskType,
        downstreamAgent: "Universal Workbench AI Agent",
        downstreamServiceId: "service-1",
        downstreamNegotiationId: "negotiation-1",
        downstreamOrderId: "order-1",
        status: A2ADelegationStatus.COMPLETED,
        requestJson: {},
        responseJson: {},
        error: null,
        paidAt: null,
        completedAt: null,
      },
      reused: false,
    };
  };

  const result = await orchestrateUniversalWorkbench(baseArgs(), runner);

  assert.deepEqual(calls, [
    "research-pack",
    "creative-pack",
    "safety-pack",
  ]);
  assert.equal(result.safety.verdict, "PASS");
  assert.match(result.signals.note, /research-pack delivered/);
  assert.match(result.signals.note, /creative-pack delivered/);
});

test("orchestrateUniversalWorkbench returns BLOCK safety decisions", async () => {
  const runner: WorkbenchTaskRunner = async (args) => ({
    taskType: args.taskType,
    request: {},
    response:
      args.taskType === A2ADelegationTaskType.SafetyPack
        ? { delivery: { text: { verdict: "BLOCK", reason: "unsafe claim" } } }
        : { delivery: { text: "ok" } },
    delegation: {} as never,
    reused: false,
  });

  const result = await orchestrateUniversalWorkbench(baseArgs(), runner);

  assert.deepEqual(result.safety, {
    verdict: "BLOCK",
    reason: "unsafe claim",
  });
});
