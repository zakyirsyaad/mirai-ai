import { CrooClient } from "@mirai/croo";
import { loadEnv } from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  parseSafetyDecision,
} from "../dist/a2a/workbench-types.js";
import { redactA2ASecrets } from "../dist/a2a/redaction.js";

const DEFAULT_CREATIVE_AGENT_ID = "0ad53b08-34bf-47a3-870f-5be9eaca0262";
const DEFAULT_CREATIVE_SERVICE_ID = "a8f1c20d-73f4-4551-856a-32315e18d261";
const MAX_APPROVED_MICRO_USDC = Number.parseInt(
  process.env.MAX_APPROVED_MICRO_USDC ?? "10000",
  10,
);
const POLL_INTERVAL_MS = 5_000;
const ORDER_CREATED_TIMEOUT_MS = 5 * 60_000;
const DELIVERY_TIMEOUT_MS = 30 * 60_000;

const env = loadEnv();

if (!env.CROO_SDK_KEY) {
  throw new Error("CROO_SDK_KEY is required for paid CROO A2A E2E.");
}

const serviceId =
  env.CROO_A2A_WORKBENCH_SERVICE_ID ??
  env.CROO_A2A_CREATIVE_SERVICE_ID ??
  DEFAULT_CREATIVE_SERVICE_ID;
const agentId =
  process.env.CROO_A2A_WORKBENCH_AGENT_ID ??
  process.env.CROO_A2A_CREATIVE_AGENT_ID ??
  DEFAULT_CREATIVE_AGENT_ID;
const downstreamAgent =
  env.CROO_A2A_WORKBENCH_AGENT_NAME ??
  env.CROO_A2A_CREATIVE_AGENT_NAME ??
  "Universal Workbench AI Agent";

const publicAgent = await fetchPublicAgent(env.CROO_API_URL, agentId);
const service = findPublicService(publicAgent, serviceId);
const priceMicroUsdc = Number(service.price);
if (!Number.isFinite(priceMicroUsdc)) {
  throw new Error(`Could not verify downstream service price: ${service.price}`);
}
if (priceMicroUsdc > MAX_APPROVED_MICRO_USDC) {
  throw new Error(
    `Refusing to pay ${priceMicroUsdc} micro-USDC; approved maximum is ${MAX_APPROVED_MICRO_USDC}.`,
  );
}

const client = new CrooClient({ env, handlers: {} });
await client.connectHttpOnly();

const baseSignals = {
  themes: ["creator workflow", "campaign planning"],
  trends: ["AI agents", "content automation"],
  note: "Manual paid CROO A2A E2E: request research, creative, and safety work packs for Mirai campaign support.",
};

const proof = {
  downstreamAgent,
  downstreamAgentId: agentId,
  downstreamServiceId: serviceId,
  approvedMaxMicroUsdc: MAX_APPROVED_MICRO_USDC,
  verifiedPriceMicroUsdc: priceMicroUsdc,
  tasks: [],
};

try {
  const taskTypes = ["research-pack", "creative-pack", "safety-pack"];
  const taskProofs = [];

  for (const taskType of taskTypes) {
    const request = buildUniversalWorkbenchRequest({
      taskType,
      campaignId: "real-universal-workbench-a2a-e2e",
      scheduledPostId: `real-universal-workbench-a2a-e2e-${taskType}-${Date.now()}`,
      upstreamCrooOrderId: "manual-paid-e2e",
      topics: ["AI creator agents", "content ops", "X campaign copy"],
      niche: "autonomous X content",
      baseSignals,
      voiceProfile: {
        tone: "clear and evidence-led",
        topics: ["AI agents", "creator workflows"],
        styleNotes: ["specific", "concise"],
        doNots: ["no unsupported predictions"],
      },
      contentPolicy: { language: "id" },
    });

    const taskProof = { taskType, request, steps: [] };
    const negotiation = await client.negotiateOrder({
      serviceId,
      requirements: request,
      metadata: {
        requester: "mirai-ai",
        kind: "paid-real-a2a-e2e",
        downstreamAgent,
        taskType,
      },
    });
    taskProof.negotiationId = negotiation.negotiationId;
    taskProof.steps.push({ step: "negotiateOrder", status: negotiation.status });

    const createdOrder = await waitForPayableOrder(negotiation.negotiationId);
    taskProof.downstreamOrderId = createdOrder.orderId;
    taskProof.steps.push({ step: "orderCreated", status: createdOrder.status });

    const payment = await client.payOrder(createdOrder.orderId);
    taskProof.payTxHash = payment.txHash;
    taskProof.steps.push({ step: "payOrder", status: payment.order.status });

    const completedOrder = await waitForDeliveryReady(createdOrder.orderId);
    taskProof.completedOrder = completedOrder;
    taskProof.steps.push({
      step: "deliveryReady",
      status: completedOrder.status,
    });

    const delivery = normalizeDelivery(
      await client.getDelivery(createdOrder.orderId),
    );
    taskProof.delivery = delivery;
    taskProof.steps.push({ step: "getDelivery", status: "ok" });
    taskProofs.push(taskProof);
  }

  proof.tasks = taskProofs;
  proof.mergedSignals = mergeWorkbenchOutputs(
    baseSignals,
    taskProofs.map((task) => ({
      taskType: task.taskType,
      response: { delivery: task.delivery },
    })),
  );
  proof.safetyDecision = parseSafetyDecision({
    delivery: taskProofs.find((task) => task.taskType === "safety-pack")
      ?.delivery,
  });

  console.log(JSON.stringify(redactA2ASecrets(proof), null, 2));
} catch (err) {
  proof.error = err instanceof Error ? err.message : "unknown real A2A E2E error";
  proof.errorCode = err?.code ?? null;
  proof.paymentAttempted = proof.tasks.some((task) => Boolean(task.payTxHash));
  console.error(JSON.stringify(redactA2ASecrets(proof), null, 2));
  process.exitCode = 1;
} finally {
  await client.disconnect();
}

async function fetchPublicAgent(baseUrl, agentId) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/backend/v1/public/agents/${agentId}`,
  );
  if (!response.ok) {
    throw new Error(`Could not verify downstream public service: HTTP ${response.status}.`);
  }
  return response.json();
}

function findPublicService(agent, serviceId) {
  const services = [
    ...(Array.isArray(agent.services) ? agent.services : []),
    ...(Array.isArray(agent.agent?.services) ? agent.agent.services : []),
    ...(Array.isArray(agent.data?.services) ? agent.data.services : []),
    ...(Array.isArray(agent.data?.agent?.services)
      ? agent.data.agent.services
      : []),
  ];
  const service = services.find((candidate) => candidate.serviceId === serviceId);
  if (!service) {
    throw new Error(`Downstream service ${serviceId} not found in public agent metadata.`);
  }
  return service;
}

async function waitForPayableOrder(negotiationId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ORDER_CREATED_TIMEOUT_MS) {
    const order = await client.findRequesterOrderByNegotiation(negotiationId);
    if (order?.status === "created" || order?.status === "paid" || order?.status === "completed") {
      return order;
    }
    if (
      order &&
      ["rejected", "expired", "create_failed", "pay_failed", "deliver_failed"].includes(
        order.status,
      )
    ) {
      throw new Error(`Downstream order ${order.orderId} ended with status ${order.status}.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  const error = new Error(
    `Timed out waiting for order for negotiation ${negotiationId}.`,
  );
  error.code = "ORDER_TIMEOUT_BEFORE_PAYMENT";
  throw error;
}

async function waitForDeliveryReady(orderId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DELIVERY_TIMEOUT_MS) {
    const order = await client.getOrder(orderId);
    if (order.status === "completed") return order;
    if (
      ["rejected", "expired", "create_failed", "pay_failed", "deliver_failed"].includes(
        order.status,
      )
    ) {
      throw new Error(`Downstream order ${orderId} ended with status ${order.status}.`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for delivery for order ${orderId}.`);
}

function normalizeDelivery(delivery) {
  return {
    deliverableType: delivery.deliverableType,
    status: delivery.status,
    schema: parseMaybeJson(delivery.deliverableSchema),
    text: parseMaybeJson(delivery.deliverableText),
  };
}

function parseMaybeJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
