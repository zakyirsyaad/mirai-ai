import {
  A2ADelegationTaskType,
  type A2ADelegationTaskType as SharedA2ADelegationTaskType,
} from "@mirai/shared";
import type { GroundingSignals } from "@mirai/content";

export type UniversalWorkbenchTaskType = SharedA2ADelegationTaskType;
export type SafetyVerdict = "PASS" | "WARN" | "BLOCK";

export interface UniversalWorkbenchArgs {
  taskType: UniversalWorkbenchTaskType;
  campaignId: string;
  scheduledPostId: string;
  upstreamCrooOrderId: string;
  topics: string[];
  niche: string | null;
  baseSignals: GroundingSignals;
  voiceProfile: {
    tone: string;
    topics: string[];
    styleNotes: string[];
    doNots: string[];
  } | null;
  contentPolicy: unknown;
}

export interface UniversalWorkbenchRequest {
  taskType: UniversalWorkbenchTaskType;
  prompt: string;
  packType: "creator-ops";
  track: "creator-content-ops";
  language: "en" | "id";
  context: {
    requester: "mirai-ai";
    purpose: string;
    campaign: {
      campaignId: string;
      scheduledPostId: string;
      upstreamCrooOrderId: string;
      niche: string | null;
      topics: string[];
    };
    voiceProfile: UniversalWorkbenchArgs["voiceProfile"];
    contentPolicy: unknown;
    baseSignals: GroundingSignals;
  };
  miraiTrace: {
    campaignId: string;
    scheduledPostId: string;
    upstreamCrooOrderId: string;
    taskType: UniversalWorkbenchTaskType;
  };
}

export interface WorkbenchOutput {
  taskType: UniversalWorkbenchTaskType;
  response: unknown;
}

export interface SafetyDecision {
  verdict: SafetyVerdict;
  reason: string | null;
}

export function buildUniversalWorkbenchRequest(
  args: UniversalWorkbenchArgs,
): UniversalWorkbenchRequest {
  return {
    taskType: args.taskType,
    prompt: buildPrompt(args),
    packType: "creator-ops",
    track: "creator-content-ops",
    language: readResponseLanguage(args.contentPolicy),
    context: {
      requester: "mirai-ai",
      purpose: purposeForTask(args.taskType),
      campaign: {
        campaignId: args.campaignId,
        scheduledPostId: args.scheduledPostId,
        upstreamCrooOrderId: args.upstreamCrooOrderId,
        niche: args.niche,
        topics: args.topics,
      },
      voiceProfile: args.voiceProfile,
      contentPolicy: args.contentPolicy,
      baseSignals: args.baseSignals,
    },
    miraiTrace: {
      campaignId: args.campaignId,
      scheduledPostId: args.scheduledPostId,
      upstreamCrooOrderId: args.upstreamCrooOrderId,
      taskType: args.taskType,
    },
  };
}

export function readResponseLanguage(contentPolicy: unknown): "en" | "id" {
  if (
    contentPolicy &&
    typeof contentPolicy === "object" &&
    "language" in contentPolicy &&
    contentPolicy.language === "id"
  ) {
    return "id";
  }
  return "en";
}

export function mergeWorkbenchOutputs(
  baseSignals: GroundingSignals,
  outputs: WorkbenchOutput[],
): GroundingSignals {
  return {
    themes: dedupe([
      ...baseSignals.themes,
      ...outputs.map((output) => `Universal Workbench ${output.taskType}`),
    ]),
    trends: baseSignals.trends,
    note: [
      baseSignals.note,
      ...outputs.map(
        (output) =>
          `Universal Workbench ${output.taskType} delivery:\n${stringifyBrief(
            output.response,
          ).slice(0, 2_000)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function parseSafetyDecision(value: unknown): SafetyDecision {
  const candidate = unwrapDeliveryText(value);
  if (candidate && typeof candidate === "object" && "verdict" in candidate) {
    const verdict = normalizeVerdict(candidate.verdict);
    return {
      verdict,
      reason:
        "reason" in candidate && typeof candidate.reason === "string"
          ? candidate.reason
          : null,
    };
  }
  if (typeof candidate === "string") {
    const upper = candidate.toUpperCase();
    if (/\bBLOCK\b/.test(upper) && !/\bNOT\s+BLOCK(?:ED)?\b/.test(upper)) {
      return { verdict: "BLOCK", reason: candidate };
    }
    if (upper.includes("PASS")) return { verdict: "PASS", reason: null };
    return { verdict: "WARN", reason: candidate };
  }
  return { verdict: "WARN", reason: stringifyBrief(value).slice(0, 500) };
}

function purposeForTask(taskType: UniversalWorkbenchTaskType): string {
  if (taskType === A2ADelegationTaskType.ResearchPack) {
    return "Mirai hires Universal Workbench to produce a source/context pack, audience signal summary, safe claim guidance, and unsupported-claim warnings for one X campaign post.";
  }
  if (taskType === A2ADelegationTaskType.CreativePack) {
    return "Mirai hires Universal Workbench to produce campaign angles, draft seeds, voice-fit notes, and creator-ops risks for one X campaign post.";
  }
  return "Mirai hires Universal Workbench to review policy risk, sensitive topics, unsupported claims, and produce a PASS, WARN, or BLOCK safety verdict for one X campaign post.";
}

function buildPrompt(args: UniversalWorkbenchArgs): string {
  const focus = dedupe([args.niche ?? "", ...args.topics]).join(", ");
  const signals = dedupe([
    ...args.baseSignals.themes,
    ...args.baseSignals.trends,
  ]).join(", ");
  const common = [
    "Create a Universal Workbench creator-ops deliverable for Mirai's X campaign.",
    `Task type: ${args.taskType}.`,
    focus ? `Campaign focus: ${focus}.` : "",
    signals ? `Current signals: ${signals}.` : "",
    args.baseSignals.note ? `Grounding note: ${args.baseSignals.note}` : "",
  ];
  if (args.taskType === A2ADelegationTaskType.ResearchPack) {
    return [
      ...common,
      "Return a concise source/context pack, audience signal summary, 3-5 safe claims, and claims to avoid.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (args.taskType === A2ADelegationTaskType.CreativePack) {
    return [
      ...common,
      "Return campaign angles, one recommended post direction, voice-fit notes, draft seeds, and risks to avoid.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    ...common,
    "Return a structured safety review with verdict PASS, WARN, or BLOCK, a short reason, and safer replacement guidance when needed.",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeVerdict(value: unknown): SafetyVerdict {
  if (value === "PASS" || value === "WARN" || value === "BLOCK") return value;
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "PASS" || upper === "WARN" || upper === "BLOCK") return upper;
  }
  return "WARN";
}

function unwrapDeliveryText(value: unknown): unknown {
  if (value && typeof value === "object" && "delivery" in value) {
    const delivery = value.delivery;
    if (delivery && typeof delivery === "object" && "text" in delivery) {
      return delivery.text;
    }
  }
  return value;
}

function stringifyBrief(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
