/**
 * CROO Provider event/lifecycle types, normalized for mirai-ai.
 *
 * The official @croo-network/sdk is the source of truth at runtime; we wrap it
 * behind a narrow surface so the rest of the codebase depends on stable shapes.
 * Raw SDK field access is isolated to client.ts — if the SDK names differ, only
 * that one file changes.
 *
 * Shapes here are aligned to @croo-network/sdk@0.2.1:
 *  - WebSocket events carry IDs only (negotiation_id / order_id); the wrapper
 *    fetches the full Negotiation/Order over HTTP to enrich them before calling
 *    a handler. So our event types below already include the *enriched* fields.
 *  - `requirements` is a JSON string on the wire — the wrapper parses it.
 *  - Buyer wallet lives on the Order (requesterWalletAddress), not on events.
 */

/** Provider-relevant event kinds we subscribe to. */
export const CrooEventType = {
  NegotiationCreated: "NegotiationCreated",
  OrderPaid: "OrderPaid",
  OrderCompleted: "OrderCompleted",
} as const;
export type CrooEventType = (typeof CrooEventType)[keyof typeof CrooEventType];

/**
 * A buyer requests our service; we accept or reject. Enriched from
 * getNegotiation() — the WS event itself only carries negotiation_id.
 * Note: the buyer wallet is NOT known at negotiation time (no on-chain order
 * exists yet); it first appears on the Order after acceptance/payment.
 */
export interface NegotiationCreatedEvent {
  type: typeof CrooEventType.NegotiationCreated;
  negotiationId: string;
  serviceId: string;
  /** Parsed from the negotiation's `requirements` JSON string (validated by @mirai/shared). */
  requirements: unknown;
}

/** Escrow funded — begin the work. Enriched from getOrder(). */
export interface OrderPaidEvent {
  type: typeof CrooEventType.OrderPaid;
  orderId: string;
  negotiationId: string;
  serviceId: string;
  /** On-chain buyer (requester) wallet — `order.requesterWalletAddress`. */
  buyerWallet: string;
  /** Parsed from the negotiation's `requirements` JSON string. */
  requirements: unknown;
  /** SLA deadline (ISO string) from `order.slaDeadline`; provider delivery deadline only. */
  slaDeadline: string;
}

/** Settlement confirmed after deliverOrder(). */
export interface OrderCompletedEvent {
  type: typeof CrooEventType.OrderCompleted;
  orderId: string;
}

export type CrooEvent =
  | NegotiationCreatedEvent
  | OrderPaidEvent
  | OrderCompletedEvent;

/** Deliverable kinds CROO accepts (mirrors SDK DeliverableType). */
export const DeliverableType = {
  Text: "Text",
  Schema: "Schema",
} as const;
export type DeliverableType =
  (typeof DeliverableType)[keyof typeof DeliverableType];

export interface TextDeliverable {
  type: typeof DeliverableType.Text;
  text: string;
}

export interface SchemaDeliverable {
  type: typeof DeliverableType.Schema;
  /** Arbitrary JSON; serialized to a string for the SDK's deliverableSchema. */
  schema: unknown;
}

export type Deliverable = TextDeliverable | SchemaDeliverable;

export interface DownstreamNegotiation {
  negotiationId: string;
  serviceId: string;
  status: string;
}

export interface DownstreamOrder {
  orderId: string;
  negotiationId: string;
  serviceId: string;
  status: string;
  payTxHash?: string;
  deliverTxHash?: string;
}

export interface DownstreamPayment {
  order: DownstreamOrder;
  txHash: string;
}

export interface DownstreamDelivery {
  orderId: string;
  deliverableType: string;
  deliverableSchema: string;
  deliverableText: string;
  status: string;
}

/** Handlers the agent registers for each event kind. */
export interface CrooEventHandlers {
  onNegotiationCreated?: (e: NegotiationCreatedEvent) => Promise<void> | void;
  onOrderPaid?: (e: OrderPaidEvent) => Promise<void> | void;
  onOrderCompleted?: (e: OrderCompletedEvent) => Promise<void> | void;
}
