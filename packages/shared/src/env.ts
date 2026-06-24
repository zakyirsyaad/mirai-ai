import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";
import {
  DEFAULT_MIRAI_API_URL,
  DEFAULT_MIRAI_LICENSE_PUBLIC_KEY,
} from "./defaults.js";

loadRootEnv();

/** Treat empty-string env vars (`KEY=`) as absent for optional fields. */
const optionalStr = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  );

function findDotenv(start: string): string {
  let dir = start;
  const root = parse(dir).root;
  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (dir === root) {
      const homeCandidate = join(homedir(), ".mirai", ".env");
      return existsSync(homeCandidate) ? homeCandidate : ".env";
    }
    dir = dirname(dir);
  }
}

function loadRootEnv(): void {
  const path = findDotenv(process.cwd());
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = parseEnvValue(line.slice(eq + 1).trim());
  }
}

function parseEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }
  return value;
}

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
  CROO_SERVICE_CONTENT_AGENT_7D_ID: optionalStr(),
  CROO_SERVICE_VOICE_IDEAS_ID: optionalStr(),

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
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://mirai:mirai@localhost:5432/mirai?schema=public"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  // Token vault — 32-byte (64 hex char) key for AES-256-GCM.
  TOKEN_VAULT_KEY: optionalStr(),

  // Agent runtime
  AGENT_EVENT_CHANNEL: z.string().default("mirai:events"),

  // Mirai MCP licensing / entitlement API
  MIRAI_RUNTIME_MODE: z.enum(["local", "hosted"]).default("hosted"),
  MIRAI_API_URL: z.string().url().default(DEFAULT_MIRAI_API_URL),
  MIRAI_LICENSE_PRIVATE_KEY: optionalStr(),
  MIRAI_LICENSE_PUBLIC_KEY: optionalStr().default(DEFAULT_MIRAI_LICENSE_PUBLIC_KEY),
  MIRAI_ENTITLEMENT_API_URL: z
    .string()
    .url()
    .default("http://localhost:8787"),
  MIRAI_ENTITLEMENT_PORT: z.coerce.number().int().positive().default(8787),
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
