import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_MIRAI_API_URL = "https://mirai.43-129-56-85.sslip.io";
export const LEGACY_MIRAI_API_URL = "http://mirai.43-129-56-85.sslip.io";
export const DEFAULT_MIRAI_LICENSE_PUBLIC_KEY =
  "base64:LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQUs5Q01namswQTNsSFRZREhNamhSS2NJemY2YkNkOGhFaUFsWU5JUFl5ZXM9Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=";

export interface MiraiConfig {
  apiUrl: string;
  licensePublicKey: string;
}

export interface LoadConfigOptions {
  env?: Readonly<Record<string, string | undefined>>;
  homeDir?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): MiraiConfig {
  const env = options.env ?? process.env;
  const fileEnv = readHomeEnv(options.homeDir ?? homedir());
  return {
    apiUrl: resolveMiraiApiUrl(
      env.MIRAI_API_URL ??
      fileEnv.MIRAI_API_URL ??
      DEFAULT_MIRAI_API_URL,
    ),
    licensePublicKey:
      env.MIRAI_LICENSE_PUBLIC_KEY ??
      fileEnv.MIRAI_LICENSE_PUBLIC_KEY ??
      DEFAULT_MIRAI_LICENSE_PUBLIC_KEY,
  };
}

export function resolveMiraiApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MIRAI_API_URL must be a valid URL.");
  }
  if (url.username || url.password) {
    throw new Error("MIRAI_API_URL must not contain credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("MIRAI_API_URL must contain only an origin, without path, query, or fragment.");
  }
  if (url.origin === LEGACY_MIRAI_API_URL) {
    return DEFAULT_MIRAI_API_URL;
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && isLoopbackHostname(url.hostname)) {
    return url.origin;
  }
  throw new Error(
    "MIRAI_API_URL must use HTTPS; HTTP is allowed only for loopback development.",
  );
}

function readHomeEnv(homeDir: string): Record<string, string> {
  const path = join(homeDir, ".mirai", ".env");
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  return text.split(/\r?\n/).reduce<Record<string, string>>((result, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return result;
    const index = trimmed.indexOf("=");
    if (index <= 0) return result;
    const key = trimmed.slice(0, index).trim();
    const envValue = trimmed.slice(index + 1).trim();
    return { ...result, [key]: stripQuotes(envValue) };
  }, {});
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
