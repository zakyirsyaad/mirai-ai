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
 * Thin wrapper over the CROO Node SDK (@croo-network/sdk).
 *
 * Responsibilities:
 *  - own the single WebSocket connection (1 WS per API key — the dashboard must
 *    NOT open its own);
 *  - normalize raw SDK events into our typed CrooEvent shapes;
 *  - expose acceptNegotiation / rejectNegotiation / deliverOrder.
 *
 * The SDK is loaded lazily so the rest of the monorepo can build/test (with the
 * mock pipeline) even when the package isn't installed yet. All raw-shape
 * access lives here — the single seam to adjust if SDK field names differ.
 */

// Minimal structural type of the SDK client we rely on. Kept loose on purpose.
interface RawAgentClient {
  connectWebSocket(): Promise<void> | void;
  on(event: string, cb: (payload: unknown) => void): void;
  acceptNegotiation(negotiationId: string): Promise<unknown>;
  rejectNegotiation(negotiationId: string): Promise<unknown>;
  deliverOrder(orderId: string, deliverable: unknown): Promise<unknown>;
  disconnect?(): Promise<void> | void;
}

type AgentClientCtor = new (
  config: { apiUrl: string; wsUrl: string },
  apiKey: string,
) => RawAgentClient;

export interface CrooClientOptions {
  env: Env;
  handlers: CrooEventHandlers;
  /** Inject a client (for tests) instead of loading the real SDK. */
  clientFactory?: () => Promise<RawAgentClient>;
}

export class CrooClient {
  private raw: RawAgentClient | undefined;

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
      { apiUrl: env.CROO_API_URL, wsUrl: env.CROO_WS_URL },
      env.CROO_SDK_KEY,
    );
  }

  /** Connect and wire event handlers. The SDK auto-reconnects + heartbeats. */
  async connect(): Promise<void> {
    const raw = await this.createRaw();
    this.raw = raw;

    raw.on(CrooEventType.NegotiationCreated, (payload) => {
      void this.opts.handlers.onNegotiationCreated?.(
        normalizeNegotiation(payload),
      );
    });
    raw.on(CrooEventType.OrderPaid, (payload) => {
      void this.opts.handlers.onOrderPaid?.(normalizeOrderPaid(payload));
    });
    raw.on(CrooEventType.OrderCompleted, (payload) => {
      void this.opts.handlers.onOrderCompleted?.(
        normalizeOrderCompleted(payload),
      );
    });

    await raw.connectWebSocket();
  }

  async acceptNegotiation(negotiationId: string): Promise<void> {
    await this.requireRaw().acceptNegotiation(negotiationId);
  }

  async rejectNegotiation(negotiationId: string): Promise<void> {
    await this.requireRaw().rejectNegotiation(negotiationId);
  }

  /** Deliver the proof-of-work report (Schema by default). */
  async deliverOrder(orderId: string, deliverable: Deliverable): Promise<void> {
    const payload =
      deliverable.type === DeliverableType.Schema
        ? { type: DeliverableType.Schema, schema: deliverable.schema }
        : { type: DeliverableType.Text, text: deliverable.text };
    await this.requireRaw().deliverOrder(orderId, payload);
  }

  async disconnect(): Promise<void> {
    await this.raw?.disconnect?.();
  }

  private requireRaw(): RawAgentClient {
    if (!this.raw) {
      throw new Error("CrooClient.connect() must be called first.");
    }
    return this.raw;
  }
}

// ─────────── normalizers: the single seam over raw SDK payloads ───────────

function asRecord(payload: unknown): Record<string, unknown> {
  return (payload ?? {}) as Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function normalizeNegotiation(payload: unknown): NegotiationCreatedEvent {
  const p = asRecord(payload);
  return {
    type: CrooEventType.NegotiationCreated,
    negotiationId: str(p.negotiationId ?? p.id),
    buyerWallet: str(p.buyerWallet ?? p.buyer ?? p.from).toLowerCase(),
    requirements: p.requirements ?? p.metadata ?? {},
  };
}

function normalizeOrderPaid(payload: unknown): OrderPaidEvent {
  const p = asRecord(payload);
  return {
    type: CrooEventType.OrderPaid,
    orderId: str(p.orderId ?? p.id),
    negotiationId: str(p.negotiationId),
    buyerWallet: str(p.buyerWallet ?? p.buyer ?? p.from).toLowerCase(),
    requirements: p.requirements ?? p.metadata ?? {},
  };
}

function normalizeOrderCompleted(payload: unknown): OrderCompletedEvent {
  const p = asRecord(payload);
  return {
    type: CrooEventType.OrderCompleted,
    orderId: str(p.orderId ?? p.id),
  };
}
