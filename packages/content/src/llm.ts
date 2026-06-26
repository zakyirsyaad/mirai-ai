import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "@mirai/shared";

/**
 * LLM abstraction. The content engine depends on this interface, not on the
 * Anthropic SDK directly, so the whole pipeline can run with a deterministic
 * mock when no configured provider key is present (zero cost, no network).
 */
export interface Llm {
  readonly kind: "anthropic" | "openmodel" | "mock";
  /** Single-turn completion. `system` steers; `prompt` is the user turn. */
  complete(args: {
    system: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string>;
}

/** Real Anthropic-backed LLM. */
export class AnthropicLlm implements Llm {
  readonly kind: "anthropic" | "openmodel";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly defaultModel: string,
    options: {
      baseURL?: string;
      kind?: "anthropic" | "openmodel";
      timeoutMs?: number;
    } = {},
  ) {
    this.kind = options.kind ?? "anthropic";
    this.client = new Anthropic({
      apiKey,
      baseURL: options.baseURL,
      timeout:
        options.timeoutMs ?? (options.kind === "openmodel" ? 60_000 : undefined),
      defaultHeaders:
        options.kind === "openmodel"
          ? { "accept-encoding": "identity" }
          : undefined,
    });
  }

  async complete(args: {
    system: string;
    prompt: string;
    model?: string;
    maxTokens?: number;
  }): Promise<string> {
    const res = await this.client.messages.create({
      model: args.model ?? this.defaultModel,
      max_tokens: args.maxTokens ?? 1024,
      system: args.system,
      messages: [{ role: "user", content: args.prompt }],
    });
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  }
}

/**
 * Deterministic mock LLM. Echoes a compact, structure-preserving response so
 * downstream JSON parsing still succeeds. Good enough to exercise the pipeline.
 */
export class MockLlm implements Llm {
  readonly kind = "mock" as const;

  async complete(args: { system: string; prompt: string }): Promise<string> {
    // If a JSON object is expected, return a minimal valid-looking stub.
    if (/json/i.test(args.system) || /json/i.test(args.prompt)) {
      return JSON.stringify({
        tone: "concise, upbeat, builder-minded",
        topics: ["AI agents", "shipping", "indie hacking"],
        styleNotes: ["short sentences", "no hashtags spam", "one idea per post"],
        doNots: ["no engagement bait", "no false claims"],
        sampleVoice: "Shipped a thing today. Small, but it works. More tomorrow.",
      });
    }
    // Otherwise return a plausible single tweet.
    const variant = args.prompt.match(/Variant style:\s*(.+)/)?.[1];
    const angle = args.prompt.match(/Angle for this post:\s*(.+)/)?.[1];
    const seed = (variant ?? angle ?? args.prompt)
      .slice(0, 40)
      .replace(/\s+/g, " ")
      .trim();
    return `Mock post grounded in: ${seed} — building in public, one step at a time.`;
  }
}

/** Pick the LLM from config; mock unless a real provider is configured. */
export function createLlm(env: Env): Llm {
  if (env.LLM_PROVIDER === "mock") return new MockLlm();

  if (env.LLM_PROVIDER === "openmodel") {
    if (!env.OPENMODEL_API_KEY) {
      throw new Error("OPENMODEL_API_KEY is required when LLM_PROVIDER=openmodel.");
    }
    return new AnthropicLlm(env.OPENMODEL_API_KEY, env.OPENMODEL_MODEL, {
      baseURL: env.OPENMODEL_BASE_URL,
      kind: "openmodel",
      timeoutMs: 60_000,
    });
  }

  if (env.LLM_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic.");
    }
    return new AnthropicLlm(env.ANTHROPIC_API_KEY, env.CONTENT_MODEL);
  }

  if (env.OPENMODEL_API_KEY) {
    return new AnthropicLlm(env.OPENMODEL_API_KEY, env.OPENMODEL_MODEL, {
      baseURL: env.OPENMODEL_BASE_URL,
      kind: "openmodel",
      timeoutMs: 60_000,
    });
  }

  if (env.ANTHROPIC_API_KEY) {
    return new AnthropicLlm(env.ANTHROPIC_API_KEY, env.CONTENT_MODEL);
  }

  return new MockLlm();
}

/** Extract the first JSON object from a model response (tolerates prose). */
export function parseJsonObject<T>(raw: string): T {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON object found in LLM response: ${raw.slice(0, 120)}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
