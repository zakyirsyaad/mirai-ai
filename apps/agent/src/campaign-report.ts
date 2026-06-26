import { PostStage } from "@mirai/db";
import {
  ContentAgentDeliverableSchema,
  ServiceType,
  type A2ADelegationTaskType,
  type ContentAgentDeliverable,
} from "@mirai/shared";
import { scorePerformance } from "@mirai/content";
import { redactA2ASecrets } from "./a2a/redaction.js";

type DeliveredPost = ContentAgentDeliverable["posts"][number];
type ReportMetrics = NonNullable<DeliveredPost["metrics"]>;
type PostRecommendation = NonNullable<DeliveredPost["recommendation"]>;
type PostDraftTournament = NonNullable<DeliveredPost["draftTournament"]>;
type LearningPreference = PostRecommendation["learnedPreferences"][number];

export interface ReportCampaignInput {
  id: string;
  createdAt: Date;
  accessExpiresAt: Date;
  order: {
    crooOrderId: string;
    negotiationId?: string | null;
    status: "PAID" | "DELIVERED" | "COMPLETED" | "FAILED";
    service: string;
    deliveredAt?: Date | null;
  };
  session: {
    xConnection?: { xHandle: string } | null;
  };
  scheduledPosts: ReportScheduledPost[];
  a2aDelegations: ReportA2ADelegation[];
}

export interface ReportScheduledPost {
  scheduledFor: Date;
  postedAt?: Date | null;
  tweetId?: string | null;
  tweetUrl?: string | null;
  draftText?: string | null;
  angle?: string | null;
  stage: PostStage;
  metrics?: unknown;
  rawMaterial?: string | null;
}

export interface ReportA2ADelegation {
  id: string;
  taskType: string;
  scheduledPostId?: string | null;
  upstreamCrooOrderId: string;
  downstreamAgent: string;
  downstreamServiceId: string;
  downstreamNegotiationId?: string | null;
  downstreamOrderId?: string | null;
  status: "NEGOTIATING" | "ORDER_CREATED" | "PAID" | "COMPLETED" | "FAILED";
  requestJson: unknown;
  responseJson?: unknown;
  error?: string | null;
  startedAt: Date;
  paidAt?: Date | null;
  completedAt?: Date | null;
}

export function buildContentAgentDeliverable(
  campaign: ReportCampaignInput,
  normalizeA2ADelegationTaskType: (value: string) => A2ADelegationTaskType | null,
): ContentAgentDeliverable {
  const posts = campaign.scheduledPosts;
  const deliveredPosts = posts.map(toDeliveredPost);
  return ContentAgentDeliverableSchema.parse({
    service: ServiceType.ContentAgent7d,
    campaignId: campaign.id,
    capProof: {
      upstreamCrooOrderId: campaign.order.crooOrderId,
      negotiationId: campaign.order.negotiationId ?? null,
      orderStatus: campaign.order.status,
      service: ServiceType.ContentAgent7d,
      deliveredAt: campaign.order.deliveredAt?.toISOString() ?? null,
    },
    xHandle: campaign.session.xConnection?.xHandle ?? "unknown",
    windowStart: campaign.createdAt.toISOString(),
    windowEnd: campaign.accessExpiresAt.toISOString(),
    summary: {
      planned: posts.length,
      posted: posts.filter((p) => p.stage === PostStage.RECORDED || p.tweetId)
        .length,
      skipped: posts.filter((p) => p.stage === PostStage.SKIPPED).length,
      failed: posts.filter((p) => p.stage === PostStage.FAILED).length,
    },
    learning: summarizeLearning(deliveredPosts),
    a2aSummary: summarizeA2A(campaign.a2aDelegations),
    posts: deliveredPosts,
    a2aDelegations: campaign.a2aDelegations.map((delegation) => ({
      delegationId: delegation.id,
      scheduledPostId: delegation.scheduledPostId ?? null,
      upstreamCrooOrderId: delegation.upstreamCrooOrderId,
      taskType: normalizeA2ADelegationTaskType(delegation.taskType),
      downstreamAgent: delegation.downstreamAgent,
      downstreamServiceId: delegation.downstreamServiceId,
      downstreamNegotiationId: delegation.downstreamNegotiationId ?? null,
      downstreamOrderId: delegation.downstreamOrderId ?? null,
      status: delegation.status,
      request: delegation.requestJson,
      response: redactA2ASecrets(delegation.responseJson ?? null),
      error: delegation.error ?? null,
      startedAt: delegation.startedAt.toISOString(),
      paidAt: delegation.paidAt?.toISOString() ?? null,
      completedAt: delegation.completedAt?.toISOString() ?? null,
    })),
  });
}

function summarizeA2A(
  delegations: ReportA2ADelegation[],
): ContentAgentDeliverable["a2aSummary"] {
  return {
    total: delegations.length,
    completed: delegations.filter((delegation) => delegation.status === "COMPLETED")
      .length,
    failed: delegations.filter((delegation) => delegation.status === "FAILED")
      .length,
    paid: delegations.filter(
      (delegation) =>
        delegation.status === "PAID" ||
        delegation.status === "COMPLETED" ||
        !!delegation.paidAt,
    ).length,
    downstreamOrders: delegations.filter((delegation) => !!delegation.downstreamOrderId)
      .length,
  };
}

function toDeliveredPost(post: ReportScheduledPost): DeliveredPost {
  const recommendation = parseRecommendation(post.rawMaterial);
  const draftTournament = parseDraftTournament(post.rawMaterial);
  const metrics = toReportMetrics(post.metrics);
  return {
    scheduledFor: post.scheduledFor.toISOString(),
    postedAt: post.postedAt?.toISOString() ?? null,
    tweetId: post.tweetId ?? null,
    tweetUrl: post.tweetUrl ?? null,
    text: post.draftText ?? "",
    status:
      post.stage === PostStage.SKIPPED
        ? "SKIPPED"
        : post.tweetId
          ? "POSTED"
          : "FAILED",
    angle: post.angle ?? recommendation?.angle ?? null,
    recommendation: recommendation
      ? {
          confidence: recommendation.confidence,
          selectedSignals: recommendation.selectedSignals,
          learnedPreferences: recommendation.learnedPreferences,
        }
      : undefined,
    draftTournament,
    metrics,
  };
}

function summarizeLearning(
  posts: DeliveredPost[],
): ContentAgentDeliverable["learning"] {
  const angleBuckets = new Map<string, { total: number; posts: number }>();
  const preferenceBuckets = new Map<
    string,
    { total: number; evidence: number }
  >();

  for (const post of posts) {
    const score = post.metrics?.performanceScore;
    if (post.angle && score !== undefined) {
      const current = angleBuckets.get(post.angle) ?? { total: 0, posts: 0 };
      angleBuckets.set(post.angle, {
        total: current.total + score,
        posts: current.posts + 1,
      });
    }

    for (const preference of post.recommendation?.learnedPreferences ?? []) {
      const current = preferenceBuckets.get(preference.label) ?? {
        total: 0,
        evidence: 0,
      };
      preferenceBuckets.set(preference.label, {
        total: current.total + preference.score * preference.evidence,
        evidence: current.evidence + preference.evidence,
      });
    }
  }

  const bestAngles = [...angleBuckets.entries()]
    .map(([angle, bucket]) => ({
      angle,
      averagePerformanceScore: round4(bucket.total / bucket.posts),
      posts: bucket.posts,
    }))
    .sort(
      (a, b) =>
        b.averagePerformanceScore - a.averagePerformanceScore ||
        b.posts - a.posts,
    )
    .slice(0, 5);

  const learnedPreferences = [...preferenceBuckets.entries()]
    .map(([label, bucket]) => ({
      label,
      score: round4(bucket.total / bucket.evidence),
      evidence: bucket.evidence,
    }))
    .sort((a, b) => b.score - a.score || b.evidence - a.evidence)
    .slice(0, 6);

  return {
    bestAngles,
    learnedPreferences,
    summary: buildLearningSummary(bestAngles, learnedPreferences),
  };
}

function parseRecommendation(rawMaterial: string | null | undefined):
  | {
      angle: string | null;
      confidence: number | null;
      selectedSignals: PostRecommendation["selectedSignals"];
      learnedPreferences: PostRecommendation["learnedPreferences"];
    }
  | undefined {
  if (!rawMaterial) return undefined;
  try {
    const parsed = JSON.parse(rawMaterial) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    if (record.kind !== "autonomous") return undefined;
    const signals = record.signals;
    if (!signals || typeof signals !== "object") return undefined;
    const signalRecord = signals as Record<string, unknown>;
    return {
      angle: asOptionalString(signalRecord.angle),
      confidence: asOptionalNumber(signalRecord.confidence),
      selectedSignals: parseSelectedSignals(signalRecord.selectedSignals),
      learnedPreferences: parseLearnedPreferences(
        signalRecord.learnedPreferences,
      ),
    };
  } catch {
    return undefined;
  }
}

function parseDraftTournament(
  rawMaterial: string | null | undefined,
): PostDraftTournament | undefined {
  const record = parseRawMaterialRecord(rawMaterial);
  if (!record || record.kind !== "autonomous") return undefined;
  const draftTournament = record.draftTournament;
  if (!draftTournament || typeof draftTournament !== "object") return undefined;
  const tournamentRecord = draftTournament as Record<string, unknown>;
  const variantCount = asOptionalNumber(tournamentRecord.variantCount);
  const winner = parseDraftCandidate(tournamentRecord.winner);
  const candidates = Array.isArray(tournamentRecord.candidates)
    ? tournamentRecord.candidates.map(parseDraftCandidate).filter(isNonNull)
    : [];
  if (variantCount === null || winner === null) return undefined;
  return {
    variantCount: Math.max(0, Math.floor(variantCount)),
    winner,
    candidates,
  };
}

function parseRawMaterialRecord(
  rawMaterial: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!rawMaterial) return undefined;
  try {
    const parsed = JSON.parse(rawMaterial) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parseDraftCandidate(value: unknown):
  | PostDraftTournament["winner"]
  | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = asOptionalString(record.text);
  const style = asOptionalString(record.style);
  const score = asOptionalNumber(record.score);
  const ok = typeof record.ok === "boolean" ? record.ok : null;
  if (text === null || style === null || score === null || ok === null) {
    return null;
  }
  return {
    text,
    style,
    score,
    ok,
    reasons: Array.isArray(record.reasons)
      ? record.reasons.filter(isString)
      : [],
    reviewReasons: Array.isArray(record.reviewReasons)
      ? record.reviewReasons.filter(isString)
      : [],
  };
}

function parseSelectedSignals(
  value: unknown,
): PostRecommendation["selectedSignals"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const source = asSignalSource(record.source);
      if (source === null) return null;
      const text = asOptionalString(record.text);
      const score = asOptionalNumber(record.score);
      if (text === null || score === null) return null;
      return {
        text,
        source,
        score,
        reasons: Array.isArray(record.reasons)
          ? record.reasons.filter(isString)
          : [],
      };
    })
    .filter(isNonNull);
}

function parseLearnedPreferences(
  value: unknown,
): PostRecommendation["learnedPreferences"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = asOptionalString(record.label);
      const score = asOptionalNumber(record.score);
      const evidence = asOptionalNumber(record.evidence);
      if (label === null || score === null || evidence === null) return null;
      return { label, score, evidence: Math.max(0, Math.floor(evidence)) };
    })
    .filter(isNonNull);
}

function toReportMetrics(value: unknown): ReportMetrics | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const likes = asOptionalNumber(record.likes);
  const reposts = asOptionalNumber(record.reposts);
  const replies = asOptionalNumber(record.replies);
  const impressions = asOptionalNumber(record.impressions);
  if (
    likes === null ||
    reposts === null ||
    replies === null ||
    impressions === null
  ) {
    return undefined;
  }
  const base = {
    likes: Math.max(0, Math.floor(likes)),
    reposts: Math.max(0, Math.floor(reposts)),
    replies: Math.max(0, Math.floor(replies)),
    impressions: Math.max(0, Math.floor(impressions)),
  };
  return {
    ...base,
    performanceScore:
      asOptionalNumber(record.performanceScore) ?? scorePerformance(base),
  };
}

function buildLearningSummary(
  bestAngles: ContentAgentDeliverable["learning"]["bestAngles"],
  learnedPreferences: ContentAgentDeliverable["learning"]["learnedPreferences"],
): string {
  const bestAngle = bestAngles[0];
  const bestPreference = learnedPreferences[0];
  if (!bestAngle && !bestPreference) {
    return "Not enough recorded engagement yet for Mirai to identify a winning angle.";
  }
  if (bestAngle && bestPreference) {
    return `Mirai learned that "${bestAngle.angle}" is the strongest recorded angle so far, with "${bestPreference.label}" as the leading learned preference.`;
  }
  if (bestAngle) {
    return `Mirai learned that "${bestAngle.angle}" is the strongest recorded angle so far.`;
  }
  return `Mirai's strongest learned preference so far is "${bestPreference?.label}".`;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSignalSource(
  value: unknown,
): "timeline" | "trend" | "topic" | "niche" | null {
  if (
    value === "timeline" ||
    value === "trend" ||
    value === "topic" ||
    value === "niche"
  ) {
    return value;
  }
  return null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
