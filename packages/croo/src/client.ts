import type { Env } from "@mirai/shared";
import {
  CrooEventType,
  DeliverableType,
  type CrooEventHandlers,
  type Deliverable,
  type NegotiationCreatedEvent,
  type OrderCompletedEvent,
  type OrderPaidEvent,
} from "./types.js";

/**
 * Thin wrapper over the CROO Node SDK (@croo-network/sdk@0.2.1).
 *
 * Responsibilities:
 *  - own the single WebSocket connection (1 WS per API key — the dashboard must
 *    NOT open its own);
 *  - subscribe to the SDK's EventStream and normalize raw events;
 *  - **enrich** events: the WS carries IDs only, so we fetch the full
 *    Negotiation/Order over HTTP to recover requirements + buyer wallet + SLA;
 *  - expose acceptNegotiation / rejectNegotiation / deliverOrder.
 *
 * The SDK is loaded lazily so the rest of the monorepo can build/test (with the
 * mock pipeline) even when the package isn't installed yet. All raw-shape
 * access lives here — the single seam to adjust if SDK field names differ.
 */

// ─────────── structural subset of the SDK surface we depend on ───────────
// Kept loose on purpose; verified against @croo-network/sdk@0.2.1 d.ts files.

interface RawNegotiation {
  negotiationId: string;
  serviceId: string;
  requirements: string; // JSON string
  status: string;
}

interface RawOrder {
  orderId: string;
  negotiationId: string;
  serviceId: string;
  requesterWalletAddress: string;
  slaDeadline: string;
  status: string;
}

interface RawEvent {
  type: string;
  raw: Record<string, unknown>;
  negotiation_id?: string;
  order_id?: string;
  service_id?: string;
  status?: string;
  reason?: string;
}

interface RawEventStream {
  on(eventType: string, handler: (event: RawEvent) => void): void;
  close(): void;
  err(): Error | null;
}

interface RawAgentClient {
  connectWebSocket(): Promise<RawEventStream>;
  getNegotiation(negotiationId: string): Promise<RawNegotiation>;
  getOrder(orderId: string): Promise<RawOrder>;
  acceptNegotiation(negotiationId: string): Promise<unknown>;
  rejectNegotiation(negotiationId: string, reason: string): Promise<unknown>;
  deliverOrder(orderId: string, req: RawDeliverRequest): Promise<unknown>;
}

interface RawDeliverRequest {
  deliverableType: string; // "text" | "schema"
  deliverableSchema?: string;
  deliverableText?: string;
}

type AgentClientCtor = new (
  config: { baseURL: string; wsURL?: string },
  sdkKey: string,
) => RawAgentClient;

/** Wire event-type strings emitted by the SDK's EventStream (snake_case). */
const WireEvent = {
  NegotiationCreated: "order_negotiation_created",
  OrderPaid: "order_paid",
  OrderCompleted: "order_completed",
} as const;

/** SDK DeliverableType values (lowercase on the wire). */
const WireDeliverable = {
  Text: "text",
  Schema: "schema",
} as const;

export interface CrooClientOptions {
  env: Env;
  handlers: CrooEventHandlers;
  /** Inject a client (for tests) instead of loading the real SDK. */
  clientFactory?: () => Promise<RawAgentClient>;
}

export class CrooClient {
  private raw: RawAgentClient | undefined;
  private stream: RawEventStream | undefined;

  constructor(private readonly opts: CrooClientOptions) {}

  /** Load the SDK lazily and construct the underlying AgentClient. */
  private async createRaw(): Promise<RawAgentClient> {
    if (this.opts.clientFactory) return this.opts.clientFactory();
    const { env } = this.opts;
    if (!env.CROO_SDK_KEY) {
      throw new Error(
        "CROO_SDK_KEY is not set — cannot connect the Provider WebSocket.",
      );
    }
    // Dynamic import keeps the dependency optional at build time.
    const mod = (await import("@croo-network/sdk")) as unknown as {
      AgentClient: AgentClientCtor;
    };
    return new mod.AgentClient(
      { baseURL: env.CROO_API_URL, wsURL: env.CROO_WS_URL },
      env.CROO_SDK_KEY,
    );
  }

  /**
   * Connect and wire event handlers. The SDK's EventStream auto-reconnects and
   * runs its own ping/pong heartbeat.
   */
  async connect(): Promise<void> {
    const raw = await this.createRaw();
    this.raw = raw;
    const stream = await raw.connectWebSocket();
    this.stream = stream;

    stream.on(WireEvent.NegotiationCreated, (e) => {
      void this.dispatchNegotiationCreated(e);
    });
    stream.on(WireEvent.OrderPaid, (e) => {
      void this.dispatchOrderPaid(e);
    });
    stream.on(WireEvent.OrderCompleted, (e) => {
      void this.dispatchOrderCompleted(e);
    });
  }

  // ─────────── event enrichment: WS carries IDs only ───────────

  private async dispatchNegotiationCreated(e: RawEvent): Promise<void> {
    const negotiationId = e.negotiation_id ?? "";
    if (!negotiationId) return;
    const negotiation = await this.requireRaw().getNegotiation(negotiationId);
    const event: NegotiationCreatedEvent = {
      type: CrooEventType.NegotiationCreated,
      negotiationId,
      serviceId: negotiation.serviceId ?? e.service_id ?? "",
      requirements: parseRequirements(negotiation.requirements),
    };
    await this.opts.handlers.onNegotiationCreated?.(event);
  }

  private async dispatchOrderPaid(e: RawEvent): Promise<void> {
    const orderId = e.order_id ?? "";
    if (!orderId) return;
    const order = await this.requireRaw().getOrder(orderId);
    // Requirements live on the negotiation, not the order — fetch it too.
    let requirements: unknown = {};
    if (order.negotiationId) {
      const negotiation = await this.requireRaw().getNegotiation(
        order.negotiationId,
      );
      requirements = parseRequirements(negotiation.requirements);
    }
    const event: OrderPaidEvent = {
      type: CrooEventType.OrderPaid,
      orderId,
      negotiationId: order.negotiationId ?? "",
      serviceId: order.serviceId ?? e.service_id ?? "",
      buyerWallet: (order.requesterWalletAddress ?? "").toLowerCase(),
      requirements,
      slaDeadline: order.slaDeadline ?? "",
    };
    await this.opts.handlers.onOrderPaid?.(event);
  }

  private async dispatchOrderCompleted(e: RawEvent): Promise<void> {
    const orderId = e.order_id ?? "";
    if (!orderId) return;
    const event: OrderCompletedEvent = {
      type: CrooEventType.OrderCompleted,
      orderId,
    };
    await this.opts.handlers.onOrderCompleted?.(event);
  }

  // ─────────── provider actions ───────────

  async acceptNegotiation(negotiationId: string): Promise<void> {
    await this.requireRaw().acceptNegotiation(negotiationId);
  }

  /** Reject a negotiation; CROO requires a human-readable reason. */
  async rejectNegotiation(
    negotiationId: string,
    reason = "requirements not accepted",
  ): Promise<void> {
    await this.requireRaw().rejectNegotiation(negotiationId, reason);
  }

  /** Deliver the proof-of-work report (Schema by default). */
  async deliverOrder(orderId: string, deliverable: Deliverable): Promise<void> {
    const req: RawDeliverRequest =
      deliverable.type === DeliverableType.Schema
        ? {
            deliverableType: WireDeliverable.Schema,
            deliverableSchema: JSON.stringify(deliverable.schema),
          }
        : {
            deliverableType: WireDeliverable.Text,
            deliverableText: deliverable.text,
          };
    await this.requireRaw().deliverOrder(orderId, req);
  }

  async disconnect(): Promise<void> {
    this.stream?.close();
    this.stream = undefined;
  }

  private requireRaw(): RawAgentClient {
    if (!this.raw) {
      throw new Error("CrooClient.connect() must be called first.");
    }
    return this.raw;
  }
}

// ─────────── helpers ───────────

/** Negotiation requirements arrive as a JSON string; parse defensively. */
function parseRequirements(raw: unknown): unknown {
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    // Free-text requirements — hand the raw string to the validator, which
    // will reject it and trigger a graceful negotiation rejection.
    return raw;
  }
}
