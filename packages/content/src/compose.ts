import type { ContentPolicyPayload, VoiceProfilePayload } from "@mirai/shared";
import type { Llm } from "./llm.js";
import type { GroundingSignals } from "./source.js";
import { voiceToPromptFragment } from "./voice.js";

/**
 * Composition — turn a brief (+ optional grounding) into an on-voice tweet, or
 * rewrite user-supplied raw content into a polished post.
 *
 * Cost note: we instruct the model to avoid URLs (X charges 13× for posts that
 * contain a link).
 */

const MAX_TWEET = 280;

const WRITE_SYSTEM = `You write a single X (Twitter) post in the user's voice.
Hard rules:
- One post only, <= 280 characters.
- Match the provided voice exactly.
- No URLs or links (they are expensive to post).
- No hashtag spam (at most one, only if natural).
- Output ONLY the post text, nothing else.`;

export interface WriteBrief {
  angle: string;
  signals?: GroundingSignals;
  policy?: ContentPolicyPayload | null;
}

export async function write(
  llm: Llm,
  brief: WriteBrief,
  voice: VoiceProfilePayload,
  model?: string,
): Promise<string> {
  const prompt = [
    `Voice:\n${voiceToPromptFragment(voice)}`,
    "",
    `Angle for this post: ${brief.angle}`,
    brief.signals ? `\nRelevant now: ${brief.signals.note}` : "",
    brief.policy ? `\nContent policy:\n${policyToPromptFragment(brief.policy)}` : "",
    "",
    "Write the post.",
  ].join("\n");
  const text = await llm.complete({ system: WRITE_SYSTEM, prompt, model });
  return clampTweet(text);
}

const REWRITE_SYSTEM = `You rewrite the user's raw content into a single polished X post in their voice.
Preserve the core message and any facts. Same hard rules as writing:
<= 280 chars, no URLs, minimal hashtags, output ONLY the post text.`;

export async function rewrite(
  llm: Llm,
  rawText: string,
  voice: VoiceProfilePayload,
  policy?: ContentPolicyPayload | null,
  model?: string,
): Promise<string> {
  const prompt = [
    `Voice:\n${voiceToPromptFragment(voice)}`,
    policy ? `\nContent policy:\n${policyToPromptFragment(policy)}` : "",
    "",
    `Raw content to repackage:\n${rawText}`,
    "",
    "Rewrite it as one post.",
  ].join("\n");
  const text = await llm.complete({ system: REWRITE_SYSTEM, prompt, model });
  return clampTweet(text);
}

function policyToPromptFragment(policy: ContentPolicyPayload): string {
  return [
    policy.allowedTopics.length
      ? `Allowed topics: ${policy.allowedTopics.join(", ")}`
      : "",
    policy.blockedTopics.length
      ? `Never discuss: ${policy.blockedTopics.join(", ")}`
      : "",
    policy.blockedPhrases.length
      ? `Never use phrases: ${policy.blockedPhrases.join(", ")}`
      : "",
    policy.language !== "any" ? `Language: ${policy.language}` : "",
    policy.toneRules.length ? `Tone rules: ${policy.toneRules.join("; ")}` : "",
    policy.formatRules.length
      ? `Format rules: ${policy.formatRules.join("; ")}`
      : "",
    policy.requireApprovalFor.length
      ? `Avoid subjects requiring approval: ${policy.requireApprovalFor.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Strip wrapping quotes/whitespace and hard-cap to tweet length. */
export function clampTweet(text: string): string {
  let t = text.trim().replace(/^["']|["']$/g, "").trim();
  if (t.length <= MAX_TWEET) return t;
  // Trim to last whitespace before the limit to avoid mid-word cuts.
  const cut = t.slice(0, MAX_TWEET);
  const lastSpace = cut.lastIndexOf(" ");
  t = (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim();
  return t;
}
