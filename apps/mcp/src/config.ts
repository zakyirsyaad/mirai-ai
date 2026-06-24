import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_MIRAI_API_URL = "https://api.mirai-agent.com";
export const DEFAULT_MIRAI_LICENSE_PUBLIC_KEY =
  "base64:LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQUs5Q01namswQTNsSFRZREhNamhSS2NJemY2YkNkOGhFaUFsWU5JUFl5ZXM9Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=";

export interface MiraiConfig {
  apiUrl: string;
  licensePublicKey: string;
}

export function loadConfig(): MiraiConfig {
  const fileEnv = readEnvFiles();
  return {
    apiUrl:
      process.env.MIRAI_API_URL ??
      fileEnv.MIRAI_API_URL ??
      DEFAULT_MIRAI_API_URL,
    licensePublicKey:
      process.env.MIRAI_LICENSE_PUBLIC_KEY ??
      fileEnv.MIRAI_LICENSE_PUBLIC_KEY ??
      DEFAULT_MIRAI_LICENSE_PUBLIC_KEY,
  };
}

function readEnvFiles(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const path of [join(homedir(), ".mirai", ".env"), ".env"]) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index <= 0) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      result[key] = stripQuotes(value);
    }
  }
  return result;
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
