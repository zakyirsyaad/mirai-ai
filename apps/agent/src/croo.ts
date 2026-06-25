import {
  LicenseDeliverySchema,
  ServiceType,
  calculateLicenseExpiresAt,
  loadEnv,
} from "@mirai/shared";
import {
  CrooClient,
  DeliverableType,
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
import {
  createEntitlementForOrder,
  summarizeLicenseForLogs,
} from "./entitlements.js";
import { resolveCrooService } from "./croo-service.js";
import {
  formatLicenseDeliveryText,
  MIRAI_DOCS_URL,
  MIRAI_NEXT_STEPS,
  MIRAI_PACKAGE_NAME,
} from "./croo-delivery.js";

/**
 * CROO integration for the agent — the SINGLE owner of the Provider WebSocket
 * (1 WS per API key). Translates marketplace lifecycle events into our domain:
 *
 *   NegotiationCreated → auto-accept (we always take the job)
 *   OrderPaid          → provision AccessSession + Order + Campaign, deliver
 *                        the signed license to CROO immediately, then enqueue
 *                        the campaign "start" job
 *   OrderCompleted     → mark the order settled
 */

const env = loadEnv();

let client: CrooClient | undefined;

export function crooClient(): CrooClient {
  if (!client)
    throw new Error("CROO client not initialized — call startCroo().");
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
  const service = resolveCrooService({
    serviceId: e.serviceId,
    requirements: e.requirements,
    env,
  });
  if (!service) {
    await crooClient().rejectNegotiation(
      e.negotiationId,
      "service does not match a listed mirai-ai service",
    );
    return;
  }
  await crooClient().acceptNegotiation(e.negotiationId);
}

async function handleOrderPaid(e: OrderPaidEvent): Promise<void> {
  const service = resolveCrooService({
    serviceId: e.serviceId,
    requirements: e.requirements,
    env,
  });
  if (!service) {
    console.warn(
      `[croo] ignoring OrderPaid for non-Mirai serviceId ${e.serviceId} order=${e.orderId}`,
    );
    return;
  }
  const buyerWallet = e.buyerWallet.toLowerCase();

  // Idempotent on crooOrderId — a redelivered event must not double-provision.
  const existing = await prisma.order.findUnique({
    where: { crooOrderId: e.orderId },
    include: { entitlement: true },
  });
  if (existing) {
    if (existing.status === OrderStatus.PAID && existing.entitlement) {
      await deliverLicenseToCroo({
        crooOrderId: existing.crooOrderId,
        orderDbId: existing.id,
        service: existing.service as ServiceType,
        licenseKey: existing.entitlement.licenseKey,
        expiresAt: existing.entitlement.expiresAt,
      });
    }
    return;
  }

  const issuedAt = new Date();
  const accessExpiresAt = calculateLicenseExpiresAt(service, issuedAt);
  const provisioned = await prisma.$transaction(async (tx) => {
    const session = await tx.accessSession.create({
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
    const entitlement = await createEntitlementForOrder({
      tx,
      orderId: order.id,
      crooOrderId: e.orderId,
      buyerWallet,
      service,
      issuedAt,
    });
    if (entitlement) {
      console.log(
        `[entitlement] issued license for ${summarizeLicenseForLogs(entitlement.licenseKey)}`,
      );
    }

    // Service #1 spins up a campaign; Service #2 (read-only) is handled by MCP.
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

    return {
      orderDbId: order.id,
      licenseKey: entitlement?.licenseKey ?? null,
      expiresAt: entitlement?.expiresAt ?? accessExpiresAt,
    };
  });

  if (provisioned.licenseKey) {
    await deliverLicenseToCroo({
      crooOrderId: e.orderId,
      orderDbId: provisioned.orderDbId,
      service,
      licenseKey: provisioned.licenseKey,
      expiresAt: provisioned.expiresAt,
    });
  }
}

async function handleOrderCompleted(e: OrderCompletedEvent): Promise<void> {
  await prisma.order.updateMany({
    where: { crooOrderId: e.orderId },
    data: { status: OrderStatus.COMPLETED },
  });
}

async function deliverLicenseToCroo(args: {
  crooOrderId: string;
  orderDbId: string;
  service: ServiceType;
  licenseKey: string;
  expiresAt: Date;
}): Promise<void> {
  if (!env.CROO_SDK_KEY) {
    console.warn(
      `[croo] CROO_SDK_KEY not set; license for ${args.crooOrderId} was generated but not delivered to CROO.`,
    );
    return;
  }

  const deliverable = LicenseDeliverySchema.parse({
    type: "mirai-license",
    service: args.service,
    orderId: args.crooOrderId,
    licenseKey: args.licenseKey,
    expiresAt: args.expiresAt.toISOString(),
    installCommand: `npm install -g ${MIRAI_PACKAGE_NAME}`,
    docsUrl: MIRAI_DOCS_URL,
    nextSteps: MIRAI_NEXT_STEPS,
  });

  await crooClient().deliverOrder(args.crooOrderId, {
    type: DeliverableType.Text,
    text: formatLicenseDeliveryText(deliverable, env.MIRAI_API_URL),
  });
  await prisma.order.update({
    where: { id: args.orderDbId },
    data: { status: OrderStatus.DELIVERED, deliveredAt: new Date() },
  });
}
