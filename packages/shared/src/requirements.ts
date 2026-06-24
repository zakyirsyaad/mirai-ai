import { z } from "zod";

/**
 * CROO order requirement & deliverable schemas.
 *
 * With the access-pass product model, most configuration happens through MCP
 * tools after payment, so the on-chain order requirements are minimal — they
 * mainly identify which service was purchased.
 */

/** The two services we register on the CROO Agent Store. */
export const ServiceType = {
  /** Service #1 — flagship 7-day posting campaign. */
  ContentAgent7d: "content-agent-7d",
  /** Service #2 — read-only voice profile + 10 content ideas. */
  VoiceIdeas: "voice-ideas",
} as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

/** Content sourcing mode for a campaign. */
export const ContentMode = {
  Autonomous: "AUTONOMOUS",
  UserSupplied: "USER_SUPPLIED",
} as const;
export type ContentMode = (typeof ContentMode)[keyof typeof ContentMode];

/** Minimal requirements attached to a CROO order/negotiation. */
export const OrderRequirementsSchema = z.object({
  service: z.nativeEnum(ServiceType),
  /** Optional buyer-supplied note for the MCP/client flow. */
  note: z.string().max(2000).optional(),
});
export type OrderRequirements = z.infer<typeof OrderRequirementsSchema>;

/** CROO settlement payload for access-pass orders delivered immediately. */
export const LicenseDeliverySchema = z.object({
  type: z.literal("mirai-license"),
  service: z.nativeEnum(ServiceType),
  orderId: z.string().min(1),
  licenseKey: z.string().startsWith("mirai_v1."),
  expiresAt: z.string().datetime(),
  installCommand: z.string().min(1),
  docsUrl: z.string().url(),
  nextSteps: z.string().min(1),
});
export type LicenseDelivery = z.infer<typeof LicenseDeliverySchema>;

/** Per-post entry in the Service #1 deliverable report. */
export const DeliveredPostSchema = z.object({
  scheduledFor: z.string().datetime(),
  postedAt: z.string().datetime().nullable(),
  tweetId: z.string().nullable(),
  tweetUrl: z.string().url().nullable(),
  text: z.string(),
  status: z.enum(["POSTED", "SKIPPED", "FAILED"]),
  metrics: z
    .object({
      likes: z.number().int().nonnegative(),
      reposts: z.number().int().nonnegative(),
      replies: z.number().int().nonnegative(),
      impressions: z.number().int().nonnegative(),
    })
    .optional(),
});
export type DeliveredPost = z.infer<typeof DeliveredPostSchema>;

/** Service #1 final report — exposed through MCP after the campaign window. */
export const ContentAgentDeliverableSchema = z.object({
  service: z.literal(ServiceType.ContentAgent7d),
  campaignId: z.string(),
  xHandle: z.string(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  summary: z.object({
    planned: z.number().int().nonnegative(),
    posted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  posts: z.array(DeliveredPostSchema),
});
export type ContentAgentDeliverable = z.infer<
  typeof ContentAgentDeliverableSchema
>;

/** Voice profile shape used by both services. */
export const VoiceProfileSchema = z.object({
  tone: z.string(),
  topics: z.array(z.string()),
  styleNotes: z.array(z.string()),
  doNots: z.array(z.string()),
  sampleVoice: z.string(),
});
export type VoiceProfilePayload = z.infer<typeof VoiceProfileSchema>;

/** Service #2 deliverable — voice profile + content ideas. */
export const VoiceIdeasDeliverableSchema = z.object({
  service: z.literal(ServiceType.VoiceIdeas),
  xHandle: z.string(),
  voiceProfile: VoiceProfileSchema,
  ideas: z
    .array(
      z.object({
        angle: z.string(),
        draft: z.string(),
      }),
    )
    .length(10),
});
export type VoiceIdeasDeliverable = z.infer<typeof VoiceIdeasDeliverableSchema>;
