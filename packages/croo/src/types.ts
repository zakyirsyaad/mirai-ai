/**
 * CROO Provider event/lifecycle types, normalized for mirai-ai.
 *
 * The official @croo-network/sdk is the source of truth at runtime; we wrap it
 * behind a narrow surface so the rest of the codebase depends on stable shapes.
 * Field access from the raw SDK payloads is isolated to client.ts — if the SDK
 * names differ slightly, only that one file changes.
 */

/** Provider-relevant event kinds we subscribe to. */
export const CrooEventType = {
  NegotiationCreated: "NegotiationCreated",
  OrderPaid: "OrderPaid",
  OrderCompleted: "OrderCompleted",
} as const;
export type CrooEventType = (typeof CrooEventType)[keyof typeof CrooEventType];

/** A buyer requests our service; we accept or reject. */
export interface NegotiationCreatedEvent {
  type: typeof CrooEventType.NegotiationCreated;
  negotiationId: string;
  buyerWallet: string;
  /** Raw requirements blob from the order (validated by @mirai/shared). */
  requirements: unknown;
}

/** Escrow funded — begin the work. */
export interface OrderPaidEvent {
  type: typeof CrooEventType.OrderPaid;
  orderId: string;
  negotiationId: string;
  buyerWallet: string;
  requirements: unknown;
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

/** Deliverable kinds CROO accepts. */
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
  schema: unknown;
}

export type Deliverable = TextDeliverable | SchemaDeliverable;

/** Handlers the agent registers for each event kind. */
export interface CrooEventHandlers {
  onNegotiationCreated?: (e: NegotiationCreatedEvent) => Promise<void> | void;
  onOrderPaid?: (e: OrderPaidEvent) => Promise<void> | void;
  onOrderCompleted?: (e: OrderCompletedEvent) => Promise<void> | void;
}
