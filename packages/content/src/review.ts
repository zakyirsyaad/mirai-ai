/**
 * Automated pre-post review (fully autonomous — no human approval).
 *
 * Checks are deterministic and cheap: length, link policy, basic safety, and
 * near-duplicate detection against recently posted text. Returns a verdict the
 * REVIEW stage uses to POST or SKIP.
 */

export interface ReviewInput {
  text: string;
  /** Recently posted texts in this campaign, for dedupe. */
  recent: string[];
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

  return { ok: reasons.length === 0, reasons };
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
