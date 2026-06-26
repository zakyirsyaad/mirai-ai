import type { XTrend, XTweet, XTweetMetrics } from "@mirai/x";

const URL_RE = /https?:\/\/\S+|\bwww\.\S+/i;

export interface RecommendationContext {
  timeline: XTweet[];
  trends: XTrend[];
  topics: string[];
  niche?: string | null;
  recentPosts?: string[];
  history?: PerformanceHistoryItem[];
  maxSignals?: number;
}

export interface PerformanceHistoryItem {
  text: string;
  angle?: string | null;
  topics?: string[];
  metrics?: XTweetMetrics | null;
}

export interface LearnedPreference {
  label: string;
  score: number;
  evidence: number;
}

export interface RecommendedSignal {
  text: string;
  source: "timeline" | "trend" | "topic" | "niche";
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  angle: string;
  confidence: number;
  selectedSignals: RecommendedSignal[];
  learnedPreferences: LearnedPreference[];
  note: string;
}

interface Candidate {
  text: string;
  source: RecommendedSignal["source"];
  createdAt?: string;
  postCount?: number;
}

export function recommendSignals(
  context: RecommendationContext,
): RecommendationResult {
  const learnedPreferences = learnPreferences(context.history ?? []);
  const candidates = sourceCandidates(context);
  const recent = context.recentPosts ?? [];
  const scored = candidates
    .map((candidate) =>
      scoreCandidate(candidate, {
        topics: context.topics,
        niche: context.niche ?? null,
        recentPosts: recent,
        learnedPreferences,
      }),
    )
    .filter((signal) => signal.score > 0)
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text));

  const selectedSignals = scored.slice(0, context.maxSignals ?? 3);
  const angle = selectAngle(selectedSignals, context, learnedPreferences);
  const confidence =
    selectedSignals.length === 0
      ? 0.2
      : round2(
          Math.max(0.25, Math.min(0.95, (selectedSignals[0]?.score ?? 0) / 12)),
        );

  return {
    angle,
    confidence,
    selectedSignals,
    learnedPreferences,
    note: buildNote(angle, selectedSignals, learnedPreferences),
  };
}

export function scorePerformance(metrics: XTweetMetrics | null | undefined): number {
  if (!metrics || metrics.impressions <= 0) return 0;
  const likesRate = metrics.likes / metrics.impressions;
  const replyRate = metrics.replies / metrics.impressions;
  const repostRate = metrics.reposts / metrics.impressions;
  return round4(likesRate + replyRate * 2 + repostRate * 3);
}

export function learnPreferences(
  history: PerformanceHistoryItem[],
): LearnedPreference[] {
  const buckets = new Map<string, { total: number; evidence: number }>();

  for (const item of history) {
    const performance = scorePerformance(item.metrics);
    if (performance <= 0) continue;
    for (const label of labelsForHistory(item)) {
      const current = buckets.get(label) ?? { total: 0, evidence: 0 };
      buckets.set(label, {
        total: current.total + performance,
        evidence: current.evidence + 1,
      });
    }
  }

  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      score: round4(bucket.total / bucket.evidence),
      evidence: bucket.evidence,
    }))
    .sort((a, b) => b.score - a.score || b.evidence - a.evidence)
    .slice(0, 6);
}

function sourceCandidates(context: RecommendationContext): Candidate[] {
  const timeline = context.timeline.map((tweet) => ({
    text: tweet.text,
    source: "timeline" as const,
    createdAt: tweet.createdAt,
  }));
  const trends = context.trends.map((trend) => ({
    text: trend.name,
    source: "trend" as const,
    postCount: trend.postCount,
  }));
  const topics = context.topics.map((topic) => ({
    text: topic,
    source: "topic" as const,
  }));
  const niche = context.niche
    ? [{ text: context.niche, source: "niche" as const }]
    : [];

  return dedupeCandidates([...timeline, ...trends, ...topics, ...niche]);
}

function scoreCandidate(
  candidate: Candidate,
  context: {
    topics: string[];
    niche: string | null;
    recentPosts: string[];
    learnedPreferences: LearnedPreference[];
  },
): RecommendedSignal {
  const reasons: string[] = [];
  let score = 1;

  if (URL_RE.test(candidate.text)) {
    score -= 10;
    reasons.push("url penalty");
  }

  const topicHits = countTopicHits(candidate.text, context.topics);
  if (topicHits > 0) {
    score += topicHits * 3;
    reasons.push("topic match");
  }

  if (context.niche && containsMeaningfulToken(candidate.text, context.niche)) {
    score += 2;
    reasons.push("niche match");
  }

  if (candidate.source === "trend") {
    score += trendStrength(candidate.postCount);
    reasons.push("trend signal");
  }

  if (candidate.source === "timeline" && candidate.createdAt) {
    const freshness = freshnessBoost(candidate.createdAt);
    score += freshness;
    if (freshness > 0) reasons.push("fresh");
  }

  if (isNearDuplicate(candidate.text, context.recentPosts)) {
    score -= 4;
    reasons.push("duplicate penalty");
  }

  const learnedBoost = context.learnedPreferences
    .filter((preference) => containsMeaningfulToken(candidate.text, preference.label))
    .reduce((total, preference) => total + Math.min(2.5, preference.score * 30), 0);
  if (learnedBoost > 0) {
    score += learnedBoost;
    reasons.push("learned winner");
  }

  return {
    text: cleanText(candidate.text),
    source: candidate.source,
    score: round2(score),
    reasons: reasons.length ? reasons : ["baseline"],
  };
}

function selectAngle(
  signals: RecommendedSignal[],
  context: RecommendationContext,
  learnedPreferences: LearnedPreference[],
): string {
  const strongestLearned = learnedPreferences[0]?.label;
  const strongestSignal = signals[0]?.text;
  return (
    strongestLearned ??
    strongestSignal ??
    context.niche ??
    context.topics[0] ??
    "a timely update"
  );
}

function buildNote(
  angle: string,
  signals: RecommendedSignal[],
  learnedPreferences: LearnedPreference[],
): string {
  const signalNote = signals.length
    ? signals
        .map(
          (signal) =>
            `${signal.text} (${signal.score}: ${signal.reasons.join(", ")})`,
        )
        .join("; ")
    : "n/a";
  const learnedNote = learnedPreferences.length
    ? learnedPreferences
        .slice(0, 3)
        .map((preference) => `${preference.label} (${preference.score})`)
        .join(", ")
    : "n/a";

  return `Recommended angle: ${angle}. Selected signals: ${signalNote}. Learned winners: ${learnedNote}.`;
}

function labelsForHistory(item: PerformanceHistoryItem): string[] {
  return dedupe([
    item.angle ?? "",
    ...(item.topics ?? []),
    ...extractKeywords(item.text).slice(0, 4),
  ]).filter(Boolean);
}

function trendStrength(postCount: number | undefined): number {
  if (!postCount || postCount <= 0) return 0.5;
  return Math.min(3, Math.log10(postCount + 1));
}

function freshnessBoost(createdAt: string): number {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return 0;
  const ageHours = (Date.now() - created) / (1000 * 60 * 60);
  if (ageHours <= 6) return 2;
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.5;
  return 0;
}

function countTopicHits(text: string, topics: string[]): number {
  return topics.filter((topic) => containsMeaningfulToken(text, topic)).length;
}

function containsMeaningfulToken(text: string, needle: string): boolean {
  const haystack = normalize(text);
  const tokens = normalize(needle)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  return tokens.some((token) => haystack.includes(token));
}

function isNearDuplicate(text: string, recentPosts: string[]): boolean {
  const terms = new Set(extractKeywords(text));
  if (terms.size === 0) return false;
  return recentPosts.some((recent) => {
    const recentTerms = new Set(extractKeywords(recent));
    if (recentTerms.size === 0) return false;
    const overlap = [...terms].filter((term) => recentTerms.has(term)).length;
    return overlap / Math.max(terms.size, recentTerms.size) >= 0.65;
  });
}

function extractKeywords(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(URL_RE, "")
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const candidate of candidates) {
    const key = normalize(candidate.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
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
