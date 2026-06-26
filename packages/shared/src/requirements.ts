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

/** Language guard for generated campaign posts. */
export const ContentLanguage = {
  Any: "any",
  Indonesian: "id",
  English: "en",
  Mixed: "mixed",
} as const;
export type ContentLanguage =
  (typeof ContentLanguage)[keyof typeof ContentLanguage];

/** User-controlled posting policy applied before anything reaches X. */
export const ContentPolicySchema = z.object({
  allowedTopics: z.array(z.string().trim().min(1)).default([]),
  blockedTopics: z.array(z.string().trim().min(1)).default([]),
  blockedPhrases: z.array(z.string().trim().min(1)).default([]),
  language: z.nativeEnum(ContentLanguage).default(ContentLanguage.Any),
  toneRules: z.array(z.string().trim().min(1)).default([]),
  formatRules: z.array(z.string().trim().min(1)).default([]),
  requireApprovalFor: z.array(z.string().trim().min(1)).default([]),
});
export type ContentPolicyPayload = z.infer<typeof ContentPolicySchema>;

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
  angle: z.string().nullable().default(null),
  recommendation: z
    .object({
      confidence: z.number().min(0).max(1).nullable().default(null),
      selectedSignals: z
        .array(
          z.object({
            text: z.string(),
            source: z.enum(["timeline", "trend", "topic", "niche"]),
            score: z.number(),
            reasons: z.array(z.string()),
          }),
        )
        .default([]),
      learnedPreferences: z
        .array(
          z.object({
            label: z.string(),
            score: z.number(),
            evidence: z.number().int().nonnegative(),
          }),
        )
        .default([]),
    })
    .optional(),
  draftTournament: z
    .object({
      variantCount: z.number().int().nonnegative(),
      winner: z.object({
        text: z.string(),
        style: z.string(),
        score: z.number(),
        ok: z.boolean(),
        reasons: z.array(z.string()),
        reviewReasons: z.array(z.string()),
      }),
      candidates: z.array(
        z.object({
          text: z.string(),
          style: z.string(),
          score: z.number(),
          ok: z.boolean(),
          reasons: z.array(z.string()),
          reviewReasons: z.array(z.string()),
        }),
      ),
    })
    .optional(),
  metrics: z
    .object({
      likes: z.number().int().nonnegative(),
      reposts: z.number().int().nonnegative(),
      replies: z.number().int().nonnegative(),
      impressions: z.number().int().nonnegative(),
      performanceScore: z.number().nonnegative().optional(),
    })
    .optional(),
});
export type DeliveredPost = z.infer<typeof DeliveredPostSchema>;

export const A2ADelegationTaskType = {
  ResearchPack: "research-pack",
  CreativePack: "creative-pack",
  SafetyPack: "safety-pack",
} as const;
export type A2ADelegationTaskType =
  (typeof A2ADelegationTaskType)[keyof typeof A2ADelegationTaskType];

export const A2ADelegationTaskTypeSchema = z.enum([
  A2ADelegationTaskType.ResearchPack,
  A2ADelegationTaskType.CreativePack,
  A2ADelegationTaskType.SafetyPack,
]);

export const A2ADelegationProofSchema = z.object({
  delegationId: z.string().min(1).nullable().default(null),
  scheduledPostId: z.string().nullable().default(null),
  upstreamCrooOrderId: z.string().min(1).nullable().default(null),
  taskType: A2ADelegationTaskTypeSchema.nullable(),
  downstreamAgent: z.string().min(1),
  downstreamServiceId: z.string().min(1),
  downstreamNegotiationId: z.string().nullable(),
  downstreamOrderId: z.string().nullable(),
  status: z.enum([
    "NEGOTIATING",
    "ORDER_CREATED",
    "PAID",
    "COMPLETED",
    "FAILED",
  ]),
  request: z.unknown(),
  response: z.unknown().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type A2ADelegationProof = z.infer<typeof A2ADelegationProofSchema>;

/** Service #1 final report — exposed through MCP after the campaign window. */
export const ContentAgentDeliverableSchema = z.object({
  service: z.literal(ServiceType.ContentAgent7d),
  campaignId: z.string(),
  capProof: z.object({
    upstreamCrooOrderId: z.string().min(1),
    negotiationId: z.string().nullable(),
    orderStatus: z.enum(["PAID", "DELIVERED", "COMPLETED", "FAILED"]),
    service: z.literal(ServiceType.ContentAgent7d),
    deliveredAt: z.string().datetime().nullable(),
  }),
  xHandle: z.string(),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  summary: z.object({
    planned: z.number().int().nonnegative(),
    posted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  learning: z.object({
    bestAngles: z.array(
      z.object({
        angle: z.string(),
        averagePerformanceScore: z.number().nonnegative(),
        posts: z.number().int().nonnegative(),
      }),
    ),
    learnedPreferences: z.array(
      z.object({
        label: z.string(),
        score: z.number(),
        evidence: z.number().int().nonnegative(),
      }),
    ),
    summary: z.string(),
  }),
  a2aSummary: z.object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    paid: z.number().int().nonnegative(),
    downstreamOrders: z.number().int().nonnegative(),
  }),
  posts: z.array(DeliveredPostSchema),
  a2aDelegations: z.array(A2ADelegationProofSchema).default([]),
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
