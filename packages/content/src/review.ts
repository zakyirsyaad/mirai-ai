/**
 * Automated pre-post review (fully autonomous — no human approval).
 *
 * Checks are deterministic and cheap: length, link policy, basic safety, and
 * near-duplicate detection against recently posted text. Returns a verdict the
 * REVIEW stage uses to POST or SKIP.
 */

import {
  ContentLanguage,
  type ContentPolicyPayload,
} from "@mirai/shared";

export interface ReviewInput {
  text: string;
  /** Recently posted texts in this campaign, for dedupe. */
  recent: string[];
  /** Optional campaign-level posting policy set by the user. */
  policy?: ContentPolicyPayload | null;
}

export interface ReviewVerdict {
  ok: boolean;
  reasons: string[];
}

const MAX_TWEET = 280;
const URL_RE = /https?:\/\/\S+|\bwww\.\S+/i;
const BANNED = [
  // light safety net; the model is also instructed to avoid these.
  "guaranteed returns",
  "not financial advice but",
  "click here",
];

export function review(input: ReviewInput): ReviewVerdict {
  const reasons: string[] = [];
  const text = input.text.trim();

  if (text.length === 0) reasons.push("empty");
  if (text.length > MAX_TWEET) reasons.push(`too long (${text.length})`);
  if (URL_RE.test(text)) reasons.push("contains URL (expensive + spammy)");

  const lc = text.toLowerCase();
  for (const phrase of BANNED) {
    if (lc.includes(phrase)) reasons.push(`banned phrase: "${phrase}"`);
  }

  if (isNearDuplicate(text, input.recent)) {
    reasons.push("near-duplicate of a recent post");
  }

  if (input.policy) {
    reasons.push(...reviewPolicy(text, input.policy));
  }

  return { ok: reasons.length === 0, reasons };
}

function reviewPolicy(text: string, policy: ContentPolicyPayload): string[] {
  const reasons: string[] = [];
  const lc = text.toLowerCase();

  for (const phrase of policy.blockedPhrases) {
    if (lc.includes(phrase.toLowerCase())) {
      reasons.push(`blocked phrase: "${phrase}"`);
    }
  }

  for (const topic of policy.blockedTopics) {
    if (containsTopic(lc, topic)) {
      reasons.push(`blocked topic: "${topic}"`);
    }
  }

  if (
    policy.allowedTopics.length > 0 &&
    !policy.allowedTopics.some((topic) => containsTopic(lc, topic))
  ) {
    reasons.push(
      `outside allowed topics: ${policy.allowedTopics.join(", ")}`,
    );
  }

  for (const term of policy.requireApprovalFor) {
    if (containsTopic(lc, term)) {
      reasons.push(`requires approval: "${term}"`);
    }
  }

  if (policy.language === ContentLanguage.Indonesian && looksEnglish(text)) {
    reasons.push("language policy: expected Indonesian");
  }
  if (policy.language === ContentLanguage.English && looksIndonesian(text)) {
    reasons.push("language policy: expected English");
  }

  for (const rule of policy.formatRules) {
    const ruleLc = rule.toLowerCase();
    if (ruleLc.includes("no hashtag") && /(^|\s)#\w+/.test(text)) {
      reasons.push("format rule: no hashtags");
    }
    if (ruleLc.includes("no emoji") && /\p{Extended_Pictographic}/u.test(text)) {
      reasons.push("format rule: no emoji");
    }
    if (ruleLc.includes("no mention") && /(^|\s)@\w+/.test(text)) {
      reasons.push("format rule: no mentions");
    }
  }

  return reasons;
}

function containsTopic(lcText: string, topic: string): boolean {
  const normalizedText = normalizeTopicText(lcText);
  const normalizedTopic = normalizeTopicText(topic);
  if (!normalizedTopic) return false;
  if (normalizedText.includes(normalizedTopic)) return true;

  const textTokens = new Set(
    normalizedText.split(" ").filter(Boolean).map(stemToken),
  );
  const topicTokens = normalizedTopic
    .split(" ")
    .filter((token) => token.length > 2)
    .map(stemToken);
  if (topicTokens.length === 0) return false;

  const matches = topicTokens.filter((token) => textTokens.has(token)).length;
  return topicTokens.length === 1
    ? matches === 1
    : matches >= Math.ceil(topicTokens.length / 2);
}

function normalizeTopicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function looksEnglish(text: string): boolean {
  const lc = text.toLowerCase();
  const englishHits = countMarkers(lc, [
    " the ",
    " and ",
    " with ",
    " for ",
    " this ",
    " that ",
    " your ",
  ]);
  const indonesianHits = countMarkers(lc, [
    " yang ",
    " dan ",
    " untuk ",
    " dengan ",
    " kalau ",
    " bisa ",
    " kita ",
  ]);
  return englishHits > indonesianHits + 1;
}

function looksIndonesian(text: string): boolean {
  const lc = text.toLowerCase();
  const indonesianHits = countMarkers(lc, [
    " yang ",
    " dan ",
    " untuk ",
    " dengan ",
    " kalau ",
    " bisa ",
    " kita ",
  ]);
  const englishHits = countMarkers(lc, [
    " the ",
    " and ",
    " with ",
    " for ",
    " this ",
    " that ",
    " your ",
  ]);
  return indonesianHits > englishHits + 1;
}

function countMarkers(text: string, markers: string[]): number {
  const padded = ` ${text} `;
  return markers.filter((marker) => padded.includes(marker)).length;
}

/** Jaccard similarity over word sets; >= 0.8 counts as a duplicate. */
export function isNearDuplicate(text: string, recent: string[]): boolean {
  const a = wordSet(text);
  for (const r of recent) {
    const b = wordSet(r);
    if (jaccard(a, b) >= 0.8) return true;
  }
  return false;
}

function wordSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
