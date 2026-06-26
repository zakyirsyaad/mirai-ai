import { setTimeout as sleep } from "node:timers/promises";
import { A2ADelegationStatus, Prisma, prisma } from "@mirai/db";
import {
  loadEnv,
  type A2ADelegationTaskType,
} from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  type UniversalWorkbenchArgs,
} from "./workbench-types.js";

const env = loadEnv();
const DEFAULT_DOWNSTREAM_AGENT = "Universal Workbench AI Agent";
const DEFAULT_WORKBENCH_SERVICE_ID = "a8f1c20d-73f4-4551-856a-32315e18d261";
const POLL_INTERVAL_MS = 5_000;
const ORDER_CREATED_TIMEOUT_MS = 5 * 60_000;
const DELIVERY_TIMEOUT_MS = 30 * 60_000;

export interface UniversalWorkbenchDelegation {
  id: string;
  campaignId: string;
  scheduledPostId: string | null;
  upstreamCrooOrderId: string;
  taskType: A2ADelegationTaskType;
  downstreamAgent: string;
  downstreamServiceId: string;
  downstreamNegotiationId: string | null;
  downstreamOrderId: string | null;
  status: A2ADelegationStatus;
  requestJson: unknown;
  responseJson: unknown | null;
  error: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
}

export interface UniversalWorkbenchStore {
  findCompleted(args: {
    scheduledPostId: string;
    downstreamServiceId: string;
    taskType: A2ADelegationTaskType;
  }): Promise<UniversalWorkbenchDelegation | null>;
  findLatest(args: {
    scheduledPostId: string;
    downstreamServiceId: string;
    taskType: A2ADelegationTaskType;
  }): Promise<UniversalWorkbenchDelegation | null>;
  create(input: {
    campaignId: string;
    scheduledPostId: string;
    upstreamCrooOrderId: string;
    taskType: A2ADelegationTaskType;
    downstreamAgent: string;
    downstreamServiceId: string;
    requestJson: unknown;
  }): Promise<UniversalWorkbenchDelegation>;
  update(
    id: string,
    data: Partial<UniversalWorkbenchDelegation>,
  ): Promise<UniversalWorkbenchDelegation>;
}

export interface UniversalWorkbenchCrooClient {
  negotiateOrder(args: {
    serviceId: string;
    requirements: unknown;
    metadata?: unknown;
  }): Promise<{ negotiationId: string; status: string }>;
  findRequesterOrderByNegotiation(
    negotiationId: string,
  ): Promise<{ orderId: string; status: string } | null>;
  payOrder(orderId: string): Promise<{
    txHash: string;
    order: { orderId: string; status: string };
  }>;
  getOrder(orderId: string): Promise<{ orderId: string; status: string }>;
  getDelivery(orderId: string): Promise<{
    deliverableType: string;
    deliverableSchema: string;
    deliverableText: string;
    status: string;
  }>;
}

export interface RunUniversalWorkbenchTaskDeps {
  downstreamAgent: string;
  downstreamServiceId: string;
  store: UniversalWorkbenchStore;
  croo: UniversalWorkbenchCrooClient;
  sleepMs: (ms: number) => Promise<void>;
  now: () => Date;
}

export interface UniversalWorkbenchTaskResult {
  taskType: A2ADelegationTaskType;
  request: unknown;
  response: unknown;
  delegation: UniversalWorkbenchDelegation;
  reused: boolean;
}

export async function runUniversalWorkbenchTask(
  args: UniversalWorkbenchArgs,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchTaskResult> {
  const completed = await deps.store.findCompleted({
    scheduledPostId: args.scheduledPostId,
    downstreamServiceId: deps.downstreamServiceId,
    taskType: args.taskType,
  });
  if (completed) {
    return {
      taskType: args.taskType,
      request: completed.requestJson,
      response: completed.responseJson,
      delegation: completed,
      reused: true,
    };
  }

  const request = buildUniversalWorkbenchRequest(args);
  const latest = await deps.store.findLatest({
    scheduledPostId: args.scheduledPostId,
    downstreamServiceId: deps.downstreamServiceId,
    taskType: args.taskType,
  });
  const delegation =
    latest ??
    (await deps.store.create({
      campaignId: args.campaignId,
      scheduledPostId: args.scheduledPostId,
      upstreamCrooOrderId: args.upstreamCrooOrderId,
      taskType: args.taskType,
      downstreamAgent: deps.downstreamAgent,
      downstreamServiceId: deps.downstreamServiceId,
      requestJson: request,
    }));

  try {
    const withNegotiation = delegation.downstreamNegotiationId
      ? delegation
      : await negotiate(delegation, request, deps);
    const withOrder = withNegotiation.downstreamOrderId
      ? withNegotiation
      : await waitForCreatedOrder(withNegotiation, deps);
    const withPayment = withOrder.paidAt
      ? withOrder
      : await payDownstreamOrder(withOrder, deps);
    const delivery = normalizeDelivery(
      await waitForDelivery(withPayment.downstreamOrderId as string, deps),
    );
    const response = { universalWorkbenchRequest: request, delivery };
    const completedDelegation = await deps.store.update(withPayment.id, {
      status: A2ADelegationStatus.COMPLETED,
      responseJson: response,
      error: null,
      completedAt: deps.now(),
    });

    return {
      taskType: args.taskType,
      request,
      response,
      delegation: completedDelegation,
      reused: false,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Universal Workbench delegation failed";
    await deps.store.update(delegation.id, {
      status:
        err instanceof PollTimeoutError
          ? delegation.status
          : A2ADelegationStatus.FAILED,
      error: message,
    });
    throw err;
  }
}

export async function runUniversalWorkbenchTaskWithDefaults(
  args: UniversalWorkbenchArgs,
): Promise<UniversalWorkbenchTaskResult> {
  const downstream = resolveUniversalWorkbenchConfig();
  if (!env.CROO_SDK_KEY || !downstream.downstreamServiceId) {
    throw new Error(
      "Real A2A requires CROO_SDK_KEY and a Universal Workbench service ID.",
    );
  }
  const { crooClient } = await import("../croo.js");
  return runUniversalWorkbenchTask(args, {
    ...downstream,
    store: prismaUniversalWorkbenchStore,
    croo: crooClient(),
    sleepMs: sleep,
    now: () => new Date(),
  });
}

export function resolveUniversalWorkbenchConfig(): {
  downstreamAgent: string;
  downstreamServiceId: string;
} {
  return {
    downstreamAgent:
      env.CROO_A2A_WORKBENCH_AGENT_NAME ??
      env.CROO_A2A_CREATIVE_AGENT_NAME ??
      DEFAULT_DOWNSTREAM_AGENT,
    downstreamServiceId:
      env.CROO_A2A_WORKBENCH_SERVICE_ID ??
      env.CROO_A2A_CREATIVE_SERVICE_ID ??
      DEFAULT_WORKBENCH_SERVICE_ID,
  };
}

const prismaUniversalWorkbenchStore: UniversalWorkbenchStore = {
  async findCompleted(args) {
    return prisma.a2ADelegation.findFirst({
      where: {
        scheduledPostId: args.scheduledPostId,
        downstreamServiceId: args.downstreamServiceId,
        taskType: args.taskType,
        status: A2ADelegationStatus.COMPLETED,
      },
      orderBy: { createdAt: "asc" },
    }) as Promise<UniversalWorkbenchDelegation | null>;
  },
  async findLatest(args) {
    return prisma.a2ADelegation.findFirst({
      where: {
        scheduledPostId: args.scheduledPostId,
        downstreamServiceId: args.downstreamServiceId,
        taskType: args.taskType,
      },
      orderBy: { createdAt: "desc" },
    }) as Promise<UniversalWorkbenchDelegation | null>;
  },
  async create(input) {
    return prisma.a2ADelegation.create({
      data: {
        campaignId: input.campaignId,
        scheduledPostId: input.scheduledPostId,
        upstreamCrooOrderId: input.upstreamCrooOrderId,
        taskType: input.taskType,
        downstreamAgent: input.downstreamAgent,
        downstreamServiceId: input.downstreamServiceId,
        requestJson: toJson(input.requestJson),
      },
    }) as Promise<UniversalWorkbenchDelegation>;
  },
  async update(id, data) {
    return prisma.a2ADelegation.update({
      where: { id },
      data: toPrismaUpdate(data),
    }) as Promise<UniversalWorkbenchDelegation>;
  },
};

async function negotiate(
  delegation: UniversalWorkbenchDelegation,
  request: unknown,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  const negotiation = await deps.croo.negotiateOrder({
    serviceId: deps.downstreamServiceId,
    requirements: request,
    metadata: {
      requester: "mirai-ai",
      kind: "a2a-delegation",
      downstreamAgent: deps.downstreamAgent,
      taskType: delegation.taskType,
    },
  });
  return deps.store.update(delegation.id, {
    downstreamNegotiationId: negotiation.negotiationId,
    status: A2ADelegationStatus.NEGOTIATING,
    error: null,
  });
}

async function waitForCreatedOrder(
  delegation: UniversalWorkbenchDelegation,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ORDER_CREATED_TIMEOUT_MS) {
    const order = await deps.croo.findRequesterOrderByNegotiation(
      delegation.downstreamNegotiationId as string,
    );
    if (order) {
      return deps.store.update(delegation.id, {
        downstreamOrderId: order.orderId,
        status: A2ADelegationStatus.ORDER_CREATED,
        error: null,
      });
    }
    await deps.sleepMs(POLL_INTERVAL_MS);
  }
  throw new PollTimeoutError(
    `Timed out waiting for downstream order creation for negotiation ${delegation.downstreamNegotiationId}.`,
  );
}

async function payDownstreamOrder(
  delegation: UniversalWorkbenchDelegation,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  await deps.croo.payOrder(delegation.downstreamOrderId as string);
  return deps.store.update(delegation.id, {
    status: A2ADelegationStatus.PAID,
    error: null,
    paidAt: deps.now(),
  });
}

async function waitForDelivery(
  downstreamOrderId: string,
  deps: RunUniversalWorkbenchTaskDeps,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DELIVERY_TIMEOUT_MS) {
    const order = await deps.croo.getOrder(downstreamOrderId);
    if (order.status === "completed") {
      return deps.croo.getDelivery(downstreamOrderId);
    }
    if (isTerminalFailure(order.status)) {
      throw new Error(
        `Downstream order ${downstreamOrderId} ended with status ${order.status}.`,
      );
    }
    await deps.sleepMs(POLL_INTERVAL_MS);
  }
  throw new PollTimeoutError(
    `Timed out waiting for downstream delivery for order ${downstreamOrderId}.`,
  );
}

function isTerminalFailure(status: string): boolean {
  return [
    "rejected",
    "expired",
    "create_failed",
    "pay_failed",
    "deliver_failed",
  ].includes(status);
}

function normalizeDelivery(delivery: {
  deliverableType: string;
  deliverableSchema: string;
  deliverableText: string;
  status: string;
}): unknown {
  return {
    deliverableType: delivery.deliverableType,
    status: delivery.status,
    schema: parseMaybeJson(delivery.deliverableSchema),
    text: parseMaybeJson(delivery.deliverableText),
  };
}

function parseMaybeJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaUpdate(
  data: Partial<UniversalWorkbenchDelegation>,
): Prisma.A2ADelegationUpdateInput {
  const update: Prisma.A2ADelegationUpdateInput = {};
  if (data.downstreamNegotiationId !== undefined) {
    update.downstreamNegotiationId = data.downstreamNegotiationId;
  }
  if (data.downstreamOrderId !== undefined) {
    update.downstreamOrderId = data.downstreamOrderId;
  }
  if (data.status !== undefined) update.status = data.status;
  if (data.error !== undefined) update.error = data.error;
  if (data.paidAt !== undefined) update.paidAt = data.paidAt;
  if (data.completedAt !== undefined) update.completedAt = data.completedAt;
  if (data.requestJson !== undefined) update.requestJson = toJson(data.requestJson);
  if (data.responseJson !== undefined) {
    update.responseJson =
      data.responseJson === null ? Prisma.DbNull : toJson(data.responseJson);
  }
  return update;
}

class PollTimeoutError extends Error {}
