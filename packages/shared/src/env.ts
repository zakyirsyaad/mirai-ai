import { z } from "zod";

/** Treat empty-string env vars (`KEY=`) as absent for optional fields. */
const optionalStr = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  );

/**
 * Centralized, validated environment access. Every package/app reads config
 * through `loadEnv()` instead of touching `process.env` directly, so a missing
 * or malformed variable fails fast at boot with a clear message.
 *
 * Secrets (CROO_SDK_KEY, X_CLIENT_SECRET, ANTHROPIC_API_KEY, TOKEN_VAULT_KEY)
 * live ONLY in `.env` (gitignored). Never hard-code them.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // CROO Network
  CROO_API_URL: z.string().url().default("https://api.croo.network"),
  CROO_WS_URL: z.string().url().default("wss://api.croo.network/ws"),
  CROO_SDK_KEY: optionalStr(),

  // X (Twitter)
  X_MODE: z.enum(["mock", "real"]).default("mock"),
  X_CLIENT_ID: optionalStr(),
  X_CLIENT_SECRET: optionalStr(),
  X_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:3000/api/x/callback"),

  // Anthropic
  ANTHROPIC_API_KEY: optionalStr(),
  CONTENT_MODEL: z.string().default("claude-sonnet-4-6"),
  CONTENT_MODEL_HQ: z.string().default("claude-opus-4-8"),

  // Infra
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // Token vault — 32-byte (64 hex char) key for AES-256-GCM.
  TOKEN_VAULT_KEY: optionalStr(),

  // App
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  AGENT_EVENT_CHANNEL: z.string().default("mirai:events"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parse & cache `process.env`. Throws a readable error on misconfiguration. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the cache — used in tests. */
export function resetEnvCache(): void {
  cached = undefined;
}

/** True when the real X adapter should be used (credentials present + mode=real). */
export function isRealXMode(env: Env): boolean {
  return env.X_MODE === "real" && !!env.X_CLIENT_ID && !!env.X_CLIENT_SECRET;
}
