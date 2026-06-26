import type { ContentPolicyPayload } from "@mirai/shared";
import { review } from "./review.js";

export const DRAFT_VARIANT_STYLES = [
  {
    id: "concise-insight",
    instruction: "A concise insight with one clear idea.",
  },
  {
    id: "contrarian-take",
    instruction: "A sharp but fair contrarian take.",
  },
  {
    id: "practical-takeaway",
    instruction: "A practical takeaway for builders or founders.",
  },
  {
    id: "mini-story",
    instruction: "A compact mini-story with a specific before/after shift.",
  },
  {
    id: "one-liner",
    instruction: "A crisp one-liner that still carries substance.",
  },
] as const;

export type DraftVariantStyle = (typeof DRAFT_VARIANT_STYLES)[number]["id"];

export interface DraftVariant {
  text: string;
  style: DraftVariantStyle | string;
}

export interface DraftCandidateScore {
  text: string;
  style: string;
  score: number;
  ok: boolean;
  reasons: string[];
  reviewReasons: string[];
}

export interface DraftTournamentResult {
  variantCount: number;
  winner: DraftCandidateScore;
  candidates: DraftCandidateScore[];
}

export interface DraftTournamentInput {
  drafts: DraftVariant[];
  recent: string[];
  policy?: ContentPolicyPayload | null;
  topics?: string[];
  angle?: string | null;
}

export function runDraftTournament(
  input: DraftTournamentInput,
): DraftTournamentResult {
  const candidates = input.drafts
    .map((draft) => scoreDraft(draft, input))
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));
  const winner = candidates[0] ?? scoreDraft({ text: "", style: "empty" }, input);

  return {
    variantCount: input.drafts.length,
    winner,
    candidates,
  };
}

function scoreDraft(
  draft: DraftVariant,
  input: DraftTournamentInput,
): DraftCandidateScore {
  const verdict = review({
    text: draft.text,
    recent: input.recent,
    policy: input.policy,
  });
  const reasons: string[] = [];
  let score = verdict.ok ? 20 : -10 * verdict.reasons.length;

  if (verdict.ok) reasons.push("passed policy review");
  if (verdict.reasons.length > 0) {
    reasons.push(...verdict.reasons.map((reason) => `review: ${reason}`));
  }

  const lengthScore = scoreLength(draft.text);
  score += lengthScore.score;
  reasons.push(lengthScore.reason);

  const topicalScore = scoreTopicalMatch(draft.text, [
    ...(input.topics ?? []),
    input.angle ?? "",
  ]);
  if (topicalScore > 0) {
    score += topicalScore;
    reasons.push("topic/angle match");
  } else {
    score -= 2;
    reasons.push("weak topic match");
  }

  const genericPenalty = genericnessPenalty(draft.text);
  if (genericPenalty > 0) {
    score -= genericPenalty;
    reasons.push("generic phrasing penalty");
  }

  return {
    text: draft.text.trim(),
    style: draft.style,
    score: round2(score),
    ok: verdict.ok,
    reasons,
    reviewReasons: verdict.reasons,
  };
}

function scoreLength(text: string): { score: number; reason: string } {
  const length = text.trim().length;
  if (length === 0) return { score: -20, reason: "empty draft" };
  if (length <= 80) return { score: 1, reason: "short draft" };
  if (length <= 220) return { score: 4, reason: "strong length" };
  if (length <= 280) return { score: 2, reason: "safe length" };
  return { score: -20, reason: "too long" };
}

function scoreTopicalMatch(text: string, topics: string[]): number {
  const normalizedText = normalize(text);
  const matches = topics.filter((topic) =>
    normalize(topic)
      .split(" ")
      .filter((token) => token.length > 2)
      .some((token) => normalizedText.includes(token)),
  );
  return Math.min(8, matches.length * 2);
}

function genericnessPenalty(text: string): number {
  const normalized = normalize(text);
  const genericPhrases = [
    "building in public",
    "one step at a time",
    "game changer",
    "future is here",
    "stay tuned",
  ];
  return genericPhrases.filter((phrase) => normalized.includes(phrase)).length * 2;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+|\bwww\.\S+/g, "")
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
