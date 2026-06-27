#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runMcpServer } from "./mcp-server.js";
import { MIRAI_HOME } from "./license-store.js";
import { healthcheck } from "./tools.js";
import {
  DEFAULT_MIRAI_API_URL,
  DEFAULT_MIRAI_LICENSE_PUBLIC_KEY,
} from "./config.js";

const [, , command = "help", ...args] = process.argv;

void main(command, args).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

async function main(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "doctor":
      console.log(JSON.stringify(await healthcheck(), null, 2));
      return;
    case "init":
      await initConfig(args);
      return;
    case "infra":
      await infra(args[0] ?? "help");
      return;
    case "config":
      printMcpConfig(args[0] ?? "json");
      return;
    case "mcp":
      await runMcpServer();
      return;
    case "worker":
      printHostedOnly("worker");
      return;
    case "start":
      printHostedOnly("start");
      return;
    case "help":
    default:
      printHelp();
  }
}

async function initConfig(args: string[]): Promise<void> {
  const hosted = args.includes("--hosted");
  const force = args.includes("--force");
  const apiUrl = readFlag(args, "--api-url") ?? DEFAULT_MIRAI_API_URL;
  await mkdir(MIRAI_HOME, { recursive: true, mode: 0o700 });
  const composePath = join(MIRAI_HOME, "docker-compose.yml");
  const envPath = ".env";
  const homeEnvPath = join(MIRAI_HOME, ".env");
  await writeFile(
    composePath,
    `services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: mirai
      POSTGRES_PASSWORD: mirai
      POSTGRES_DB: mirai
    ports:
      - "5432:5432"
    volumes:
      - mirai-postgres:/var/lib/postgresql/data
  redis:
    image: redis:7
    ports:
      - "6379:6379"
volumes:
  mirai-postgres:
`,
    { mode: 0o600 },
  );
  if (force || !existsSync(envPath)) {
    await writeFile(envPath, await envTemplate({ hosted, apiUrl }), { mode: 0o600 });
    console.log(`Wrote ${envPath}`);
  } else {
    console.log(`${envPath} already exists; left it unchanged.`);
  }
  if (force || !existsSync(homeEnvPath)) {
    await writeFile(homeEnvPath, await envTemplate({ hosted, apiUrl }), { mode: 0o600 });
    console.log(`Wrote ${homeEnvPath}`);
  } else {
    console.log(`${homeEnvPath} already exists; left it unchanged.`);
  }
  console.log(`Wrote ${composePath}`);
  console.log(
    hosted
      ? "Next: mirai doctor, then mirai config json."
      : "Next: mirai infra up, then mirai doctor.",
  );
}

async function infra(action: string): Promise<void> {
  if (action !== "up" && action !== "down") {
    console.log("Usage: mirai infra up|down");
    return;
  }
  printHostedOnly(`infra ${action}`);
}

function printMcpConfig(format: string): void {
  const config = {
    command: "mirai",
    args: ["mcp"],
    env: {
      MIRAI_API_URL: DEFAULT_MIRAI_API_URL,
    },
  };
  const json = {
    mcpServers: {
      mirai: config,
    },
  };
  if (format === "codex" || format === "claude") {
    console.log(JSON.stringify(json, null, 2));
    return;
  }
  if (format === "hermes") {
    console.log("hermes mcp add mirai --command mirai --args mcp");
    console.log(`hermes mcp env mirai MIRAI_API_URL ${DEFAULT_MIRAI_API_URL}`);
    console.log("hermes mcp test mirai");
    return;
  }
  if (format === "local") {
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            mirai: {
              command: "node",
              args: [join(process.cwd(), "apps/mcp/dist/cli.js"), "mcp"],
              cwd: process.cwd(),
            },
          },
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(JSON.stringify(json, null, 2));
}

async function envTemplate(args: {
  hosted: boolean;
  apiUrl: string;
}): Promise<string> {
  const existingPublicKey =
    (await readExistingEnv("MIRAI_LICENSE_PUBLIC_KEY")) ??
    DEFAULT_MIRAI_LICENSE_PUBLIC_KEY;
  return `# Mirai ${args.hosted ? "hosted" : "local"} MCP runtime
NODE_ENV=development
MIRAI_RUNTIME_MODE=${args.hosted ? "hosted" : "local"}
MIRAI_API_URL=${args.apiUrl}
DATABASE_URL=postgresql://mirai:mirai@localhost:5432/mirai?schema=public
REDIS_URL=redis://localhost:6379
TOKEN_VAULT_KEY=${randomBytes(32).toString("hex")}

# X OAuth. Leave mock for local smoke tests; set real credentials for posting.
X_MODE=mock
X_CLIENT_ID=
X_CLIENT_SECRET=
X_OAUTH_REDIRECT_URI=http://127.0.0.1:3000/api/x/callback

# Content engine. Empty keys use deterministic mock LLM.
LLM_PROVIDER=auto
AI_API_KEY=
AI_BASE_URL=https://api.badtheorylabs.com/v1
AI_MODEL=btl-2
AI_TIMEOUT_MS=60000
ANTHROPIC_API_KEY=
CONTENT_MODEL=claude-sonnet-4-6
CONTENT_MODEL_HQ=claude-opus-4-8
OPENMODEL_API_KEY=
OPENMODEL_BASE_URL=https://api.openmodel.ai
OPENMODEL_MODEL=deepseek-v4-flash

# Mirai entitlement/license verification.
MIRAI_LICENSE_PUBLIC_KEY=${existingPublicKey ?? ""}
MIRAI_ENTITLEMENT_API_URL=${args.apiUrl}
MIRAI_ENTITLEMENT_PORT=8787

# Provider-only values. Local users normally leave these empty.
CROO_API_URL=https://api.croo.network
CROO_WS_URL=wss://api.croo.network/ws
CROO_SDK_KEY=
MIRAI_LICENSE_PRIVATE_KEY=
AGENT_EVENT_CHANNEL=mirai:events
`;
}

function readFlag(args: string[], name: string): string | null {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

async function readExistingEnv(key: string): Promise<string | null> {
  for (const path of [".env", join(MIRAI_HOME, ".env")]) {
    if (!existsSync(path)) continue;
    const text = await readFile(path, "utf8");
    const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function printHostedOnly(command: string): void {
  console.log(
    `mirai ${command} is for self-hosted development builds. The npm package uses hosted mode by default; run mirai mcp from your MCP client.`,
  );
}

function printHelp(): void {
  console.log(`Mirai MCP

Usage:
  mirai doctor
  mirai init [--hosted --api-url https://api.example.com] [--force]
  mirai infra up|down
  mirai config [json|local|claude|codex|hermes]
  mirai mcp
  mirai worker
  mirai start
`);
}
