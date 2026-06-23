import type { XTrend, XTweet } from "@mirai/x";

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
  /** Raw note appended to the writer prompt. */
  note: string;
}

/** Build grounding from live X signals. */
export function groundFromX(
  timeline: XTweet[],
  trends: XTrend[],
  topics: string[],
): GroundingSignals {
  const themes = dedupe(
    timeline
      .flatMap((t) => extractKeywords(t.text))
      .filter((k) => k.length > 3),
  ).slice(0, 8);

  const topicSet = new Set(topics.map((t) => t.toLowerCase()));
  const ranked = trends
    .map((t) => t.name)
    .sort((a, b) => relevance(b, topicSet) - relevance(a, topicSet))
    .slice(0, 5);

  return {
    themes,
    trends: ranked,
    note: `Timeline themes: ${themes.join(", ") || "n/a"}. Trends: ${ranked.join(", ") || "n/a"}.`,
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

function relevance(name: string, topicSet: Set<string>): number {
  const lc = name.toLowerCase();
  let score = 0;
  for (const t of topicSet) {
    if (lc.includes(t)) score += 2;
  }
  return score;
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
