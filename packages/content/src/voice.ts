import {
  VoiceProfileSchema,
  type VoiceProfilePayload,
} from "@mirai/shared";
import type { XTweet } from "@mirai/x";
import { parseJsonObject, type Llm } from "./llm.js";

/**
 * Voice extraction.
 *
 *  - `deriveVoiceProfile`        — learn voice from the account's own tweets.
 *  - `buildVoiceProfileFromQuestionnaire` — cold-start path for empty accounts.
 */

const VOICE_SYSTEM = `You analyze a person's X (Twitter) posts and distill their writing voice.
Respond with ONLY a JSON object matching this shape:
{
  "tone": string,            // e.g. "dry, technical, occasionally funny"
  "topics": string[],        // recurring subjects
  "styleNotes": string[],    // concrete stylistic habits to imitate
  "doNots": string[],        // things to avoid to stay on-voice
  "sampleVoice": string      // one short tweet in their voice (no hashtags/links)
}`;

export async function deriveVoiceProfile(
  llm: Llm,
  tweets: XTweet[],
): Promise<VoiceProfilePayload> {
  const corpus = tweets
    .map((t, i) => `${i + 1}. ${t.text}`)
    .join("\n")
    .slice(0, 6000);
  const raw = await llm.complete({
    system: VOICE_SYSTEM,
    prompt: `Here are the account's recent posts:\n\n${corpus}\n\nDistill the voice as JSON.`,
  });
  return VoiceProfileSchema.parse(parseJsonObject(raw));
}

export interface QuestionnaireAnswers {
  niche: string;
  audience: string;
  goal: string;
  /** Optional free-text describing desired tone. */
  toneHint?: string;
}

const QUESTIONNAIRE_SYSTEM = `You design a writing voice for a NEW X account that has no posts yet,
based on the owner's stated niche, audience, and goal. Respond with ONLY a JSON object:
{ "tone": string, "topics": string[], "styleNotes": string[], "doNots": string[], "sampleVoice": string }`;

export async function buildVoiceProfileFromQuestionnaire(
  llm: Llm,
  answers: QuestionnaireAnswers,
): Promise<VoiceProfilePayload> {
  const raw = await llm.complete({
    system: QUESTIONNAIRE_SYSTEM,
    prompt: [
      `Niche: ${answers.niche}`,
      `Audience: ${answers.audience}`,
      `Goal: ${answers.goal}`,
      answers.toneHint ? `Tone preference: ${answers.toneHint}` : "",
      "",
      "Design a fitting voice as JSON.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  return VoiceProfileSchema.parse(parseJsonObject(raw));
}

/** Render a voice profile into a compact system-prompt fragment for writing. */
export function voiceToPromptFragment(v: VoiceProfilePayload): string {
  return [
    `Tone: ${v.tone}`,
    `Topics: ${v.topics.join(", ")}`,
    `Style: ${v.styleNotes.join("; ")}`,
    `Avoid: ${v.doNots.join("; ")}`,
    `Voice sample: "${v.sampleVoice}"`,
  ].join("\n");
}
