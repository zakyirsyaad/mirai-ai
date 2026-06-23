import type { VoiceProfilePayload } from "@mirai/shared";
import { parseJsonObject, type Llm } from "./llm.js";
import { voiceToPromptFragment } from "./voice.js";

/**
 * Service #2 deliverable — generate 10 tailored content ideas (angle + draft)
 * from a voice profile. Read-only; no posting.
 */

export interface ContentIdea {
  angle: string;
  draft: string;
}

const IDEAS_SYSTEM = `You generate exactly 10 X (Twitter) post ideas tailored to a creator's voice.
Respond with ONLY a JSON object: { "ideas": [ { "angle": string, "draft": string }, ... ] }
Each draft must be <= 280 chars, no URLs, in the creator's voice.`;

export async function generateContentIdeas(
  llm: Llm,
  voice: VoiceProfilePayload,
  model?: string,
): Promise<ContentIdea[]> {
  const raw = await llm.complete({
    system: IDEAS_SYSTEM,
    prompt: `Voice:\n${voiceToPromptFragment(voice)}\n\nGenerate 10 ideas as JSON.`,
    model,
    maxTokens: 2048,
  });
  const parsed = parseJsonObject<{ ideas: ContentIdea[] }>(raw);
  const ideas = (parsed.ideas ?? []).slice(0, 10);
  // Pad defensively so the deliverable always has 10 (mock or terse models).
  while (ideas.length < 10) {
    ideas.push({
      angle: `Idea ${ideas.length + 1}`,
      draft: voice.sampleVoice,
    });
  }
  return ideas;
}
