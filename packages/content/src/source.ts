import type { XTrend, XTweet } from "@mirai/x";
import {
  recommendSignals,
  type LearnedPreference,
  type PerformanceHistoryItem,
  type RecommendedSignal,
} from "./recommendation.js";

/**
 * Grounding signals for AUTONOMOUS mode. We turn the hirer's own X signals
 * (home timeline + personalized trends) into a compact "what's relevant now"
 * brief that the writer can reference — keeping posts timely and on-topic
 * without an external web-search provider.
 */

export interface GroundingSignals {
  /** Short bullet summary of themes seen in the timeline. */
  themes: string[];
  /** Trend names worth riding (filtered to the account's topics). */
  trends: string[];
  /** Best ranked source material, with scoring reasons for observability. */
  selectedSignals?: RecommendedSignal[];
  /** Feedback-derived preferences from earlier posts in the same campaign. */
  learnedPreferences?: LearnedPreference[];
  /** Recommendation engine's selected angle for this slot. */
  angle?: string;
  /** 0-1 confidence score for the selected angle/signals. */
  confidence?: number;
  /** Raw note appended to the writer prompt. */
  note: string;
}

/** Build grounding from live X signals. */
export function groundFromX(
  timeline: XTweet[],
  trends: XTrend[],
  topics: string[],
  context: {
    niche?: string | null;
    recentPosts?: string[];
    history?: PerformanceHistoryItem[];
  } = {},
): GroundingSignals {
  const recommendation = recommendSignals({
    timeline,
    trends,
    topics,
    niche: context.niche,
    recentPosts: context.recentPosts,
    history: context.history,
  });
  const themes = dedupe(
    recommendation.selectedSignals
      .filter((signal) => signal.source !== "trend")
      .flatMap((signal) => extractKeywords(signal.text)),
  ).slice(0, 8);
  const ranked = recommendation.selectedSignals
    .filter((signal) => signal.source === "trend")
    .map((signal) => signal.text)
    .slice(0, 5);

  return {
    themes,
    trends: ranked,
    selectedSignals: recommendation.selectedSignals,
    learnedPreferences: recommendation.learnedPreferences,
    angle: recommendation.angle,
    confidence: recommendation.confidence,
    note: recommendation.note,
  };
}

/**
 * Fallback grounding when timeline/trends are unavailable (e.g. personalized
 * trends not offered on pay-per-use, or USER_SUPPLIED cold-start). Uses the
 * declared niche + the account's own topics so writing still has direction.
 */
export function groundFromNicheAndTrends(
  niche: string,
  topics: string[],
  trends: XTrend[] = [],
): GroundingSignals {
  const themes = dedupe([niche, ...topics]).slice(0, 8);
  const ranked = trends.map((t) => t.name).slice(0, 5);
  return {
    themes,
    trends: ranked,
    note: `Niche: ${niche}. Topics: ${topics.join(", ") || "n/a"}.${
      ranked.length ? ` Trends: ${ranked.join(", ")}.` : ""
    }`,
  };
}

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9#\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "your",
  "about",
  "just",
  "they",
  "what",
  "when",
  "will",
  "been",
  "were",
  "them",
  "then",
  "than",
  "into",
  "more",
  "some",
  "like",
]);
