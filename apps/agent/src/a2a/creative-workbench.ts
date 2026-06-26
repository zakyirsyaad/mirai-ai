import { setTimeout as sleep } from "node:timers/promises";
import { A2ADelegationStatus, Prisma, prisma } from "@mirai/db";
import { A2ADelegationTaskType, loadEnv } from "@mirai/shared";
import type { GroundingSignals } from "@mirai/content";
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  type UniversalWorkbenchRequest,
} from "./workbench-types.js";

export { readResponseLanguage } from "./workbench-types.js";

const env = loadEnv();
const DEFAULT_DOWNSTREAM_AGENT = "Universal Workbench AI Agent";
const DEFAULT_CREATIVE_SERVICE_ID = "a8f1c20d-73f4-4551-856a-32315e18d261";
const POLL_INTERVAL_MS = 5_000;
const ORDER_CREATED_TIMEOUT_MS = 5 * 60_000;
const DELIVERY_TIMEOUT_MS = 30 * 60_000;

export interface AcquireCreativeWorkbenchSignalsArgs {
  campaignId: string;
  scheduledPostId: string;
  upstreamCrooOrderId: string;
  topics: string[];
  niche: string | null;
  baseSignals: GroundingSignals;
  voiceProfile: {
    tone: string;
    topics: string[];
    styleNotes: string[];
    doNots: string[];
  } | null;
  contentPolicy: unknown;
}

export type CreativeWorkbenchRequest = UniversalWorkbenchRequest;

export async function acquireCreativeWorkbenchSignals(
  args: AcquireCreativeWorkbenchSignalsArgs,
): Promise<GroundingSignals> {
  const downstreamServiceId =
    env.CROO_A2A_CREATIVE_SERVICE_ID ?? DEFAULT_CREATIVE_SERVICE_ID;
  const downstreamAgent =
    env.CROO_A2A_CREATIVE_AGENT_NAME ?? DEFAULT_DOWNSTREAM_AGENT;

  if (!env.CROO_SDK_KEY || !downstreamServiceId) {
    throw new Error(
      "Real A2A requires CROO_SDK_KEY and CROO_A2A_CREATIVE_SERVICE_ID.",
    );
  }

  const existingCompleted = await findCompletedCampaignDelegation(
    args.campaignId,
    downstreamServiceId,
  );
  if (existingCompleted) {
    return mergeSignals(args.baseSignals, {
      creativeWorkbenchRequest: existingCompleted.requestJson,
      delivery: existingCompleted.responseJson,
      reused: true,
    });
  }

  const request = buildCreativeWorkbenchRequest(args);
  const delegation = await findOrCreateDelegation({
    ...args,
    downstreamAgent,
    downstreamServiceId,
    request,
  });

  try {
    const withNegotiation = delegation.downstreamNegotiationId
      ? delegation
      : await negotiate(
          delegation.id,
          downstreamAgent,
          downstreamServiceId,
          request,
        );

    const withOrder = withNegotiation.downstreamOrderId
      ? withNegotiation
      : await waitForCreatedOrder(
          withNegotiation.id,
          withNegotiation.downstreamNegotiationId as string,
        );

    const withPayment = withOrder.paidAt
      ? withOrder
      : await payDownstreamOrder(
          withOrder.id,
          withOrder.downstreamOrderId as string,
        );

    const delivery = normalizeDelivery(
      await waitForDelivery(withPayment.downstreamOrderId as string),
    );
    const response = {
      creativeWorkbenchRequest: request,
      delivery,
    };

    await prisma.a2ADelegation.update({
      where: { id: withPayment.id },
      data: {
        status: A2ADelegationStatus.COMPLETED,
        responseJson: toJson(response),
        error: null,
        completedAt: new Date(),
      },
    });

    return mergeSignals(args.baseSignals, response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "A2A delegation failed";
    await prisma.a2ADelegation.update({
      where: { id: delegation.id },
      data: {
        status:
          err instanceof PollTimeoutError
            ? delegation.status
            : A2ADelegationStatus.FAILED,
        error: message,
      },
    });
    throw err;
  }
}

export function buildCreativeWorkbenchRequest(
  args: AcquireCreativeWorkbenchSignalsArgs,
): CreativeWorkbenchRequest {
  return buildUniversalWorkbenchRequest({
    ...args,
    taskType: A2ADelegationTaskType.CreativePack,
  });
}

async function findCompletedCampaignDelegation(
  campaignId: string,
  downstreamServiceId: string,
) {
  return prisma.a2ADelegation.findFirst({
    where: {
      campaignId,
      downstreamServiceId,
      status: A2ADelegationStatus.COMPLETED,
    },
    orderBy: { createdAt: "asc" },
  });
}

async function findOrCreateDelegation(
  args: AcquireCreativeWorkbenchSignalsArgs & {
    downstreamAgent: string;
    downstreamServiceId: string;
    request: unknown;
  },
) {
  const existing = await prisma.a2ADelegation.findFirst({
    where: {
      scheduledPostId: args.scheduledPostId,
      downstreamServiceId: args.downstreamServiceId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.a2ADelegation.create({
    data: {
      campaignId: args.campaignId,
      scheduledPostId: args.scheduledPostId,
      upstreamCrooOrderId: args.upstreamCrooOrderId,
      downstreamAgent: args.downstreamAgent,
      downstreamServiceId: args.downstreamServiceId,
      requestJson: toJson(args.request),
    },
  });
}

async function negotiate(
  delegationId: string,
  downstreamAgent: string,
  downstreamServiceId: string,
  request: unknown,
) {
  const croo = await getCrooClient();
  const negotiation = await croo.negotiateOrder({
    serviceId: downstreamServiceId,
    requirements: request,
    metadata: {
      requester: "mirai-ai",
      kind: "a2a-delegation",
      downstreamAgent,
    },
  });
  return prisma.a2ADelegation.update({
    where: { id: delegationId },
    data: {
      downstreamNegotiationId: negotiation.negotiationId,
      status: A2ADelegationStatus.NEGOTIATING,
      error: null,
    },
  });
}

async function waitForCreatedOrder(
  delegationId: string,
  negotiationId: string,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ORDER_CREATED_TIMEOUT_MS) {
    const croo = await getCrooClient();
    const order = await croo.findRequesterOrderByNegotiation(negotiationId);
    if (order) {
      return prisma.a2ADelegation.update({
        where: { id: delegationId },
        data: {
          downstreamOrderId: order.orderId,
          status: A2ADelegationStatus.ORDER_CREATED,
          error: null,
        },
      });
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new PollTimeoutError(
    `Timed out waiting for downstream order creation for negotiation ${negotiationId}.`,
  );
}

async function payDownstreamOrder(
  delegationId: string,
  downstreamOrderId: string,
) {
  const croo = await getCrooClient();
  await croo.payOrder(downstreamOrderId);
  return prisma.a2ADelegation.update({
    where: { id: delegationId },
    data: {
      status: A2ADelegationStatus.PAID,
      error: null,
      paidAt: new Date(),
    },
  });
}

async function waitForDelivery(downstreamOrderId: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DELIVERY_TIMEOUT_MS) {
    const croo = await getCrooClient();
    const order = await croo.getOrder(downstreamOrderId);
    if (order.status === "completed") {
      return croo.getDelivery(downstreamOrderId);
    }
    if (isTerminalFailure(order.status)) {
      throw new Error(
        `Downstream order ${downstreamOrderId} ended with status ${order.status}.`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
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

export function mergeSignals(
  baseSignals: GroundingSignals,
  creativeResponse: unknown,
): GroundingSignals {
  return mergeWorkbenchOutputs(baseSignals, [
    {
      taskType: A2ADelegationTaskType.CreativePack,
      response: creativeResponse,
    },
  ]);
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

async function getCrooClient() {
  const { crooClient } = await import("../croo.js");
  return crooClient();
}

class PollTimeoutError extends Error {}
