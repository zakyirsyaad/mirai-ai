import { loadEnv, OrderRequirementsSchema, ServiceType } from "@mirai/shared";
import {
  CrooClient,
  type NegotiationCreatedEvent,
  type OrderCompletedEvent,
  type OrderPaidEvent,
} from "@mirai/croo";
import {
  prisma,
  CampaignStatus,
  ContentMode,
  OrderStatus,
  SessionStatus,
} from "@mirai/db";
import { campaignQueue } from "./queues.js";

/**
 * CROO integration for the agent — the SINGLE owner of the Provider WebSocket
 * (1 WS per API key). Translates marketplace lifecycle events into our domain:
 *
 *   NegotiationCreated → auto-accept (we always take the job)
 *   OrderPaid          → provision DashboardSession + Order + Campaign,
 *                        then enqueue the campaign "start" job
 *   OrderCompleted     → mark the order settled
 */

const env = loadEnv();
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

let client: CrooClient | undefined;

export function crooClient(): CrooClient {
  if (!client) throw new Error("CROO client not initialized — call startCroo().");
  return client;
}

export async function startCroo(): Promise<void> {
  client = new CrooClient({
    env,
    handlers: {
      onNegotiationCreated: handleNegotiationCreated,
      onOrderPaid: handleOrderPaid,
      onOrderCompleted: handleOrderCompleted,
    },
  });
  await client.connect();
}

async function handleNegotiationCreated(
  e: NegotiationCreatedEvent,
): Promise<void> {
  // We accept every well-formed negotiation for our listed services.
  const parsed = OrderRequirementsSchema.safeParse(e.requirements);
  if (!parsed.success) {
    await crooClient().rejectNegotiation(e.negotiationId);
    return;
  }
  await crooClient().acceptNegotiation(e.negotiationId);
}

async function handleOrderPaid(e: OrderPaidEvent): Promise<void> {
  const parsed = OrderRequirementsSchema.safeParse(e.requirements);
  const service = parsed.success
    ? parsed.data.service
    : ServiceType.ContentAgent7d;
  const buyerWallet = e.buyerWallet.toLowerCase();
  const accessExpiresAt = new Date(Date.now() + WINDOW_MS);

  // Idempotent on crooOrderId — a redelivered event must not double-provision.
  const existing = await prisma.order.findUnique({
    where: { crooOrderId: e.orderId },
  });
  if (existing) return;

  await prisma.$transaction(async (tx) => {
    const session = await tx.dashboardSession.create({
      data: {
        buyerWallet,
        status: SessionStatus.ACTIVE,
        accessExpiresAt,
      },
    });
    const order = await tx.order.create({
      data: {
        crooOrderId: e.orderId,
        negotiationId: e.negotiationId,
        buyerWallet,
        service,
        status: OrderStatus.PAID,
        sessionId: session.id,
      },
    });
    // Service #1 spins up a campaign; Service #2 (read-only) is handled in-app.
    if (service === ServiceType.ContentAgent7d) {
      const campaign = await tx.campaign.create({
        data: {
          orderId: order.id,
          sessionId: session.id,
          contentMode: ContentMode.AUTONOMOUS,
          enabled: true,
          status: CampaignStatus.WAITING_FOR_X,
          accessExpiresAt,
        },
      });
      // Enqueue start (will park in WAITING_FOR_X until X is connected).
      await campaignQueue.add("start", {
        action: "start",
        campaignId: campaign.id,
      });
    }
  });
}

async function handleOrderCompleted(e: OrderCompletedEvent): Promise<void> {
  await prisma.order.updateMany({
    where: { crooOrderId: e.orderId },
    data: { status: OrderStatus.COMPLETED },
  });
}
