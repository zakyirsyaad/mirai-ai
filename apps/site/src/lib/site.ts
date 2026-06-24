export const siteConfig = {
  name: "Mirai",
  defaultApiUrl:
    process.env.NEXT_PUBLIC_MIRAI_API_URL ?? "https://api.mirai-agent.com",
  packageName: process.env.NEXT_PUBLIC_NPM_PACKAGE_NAME ?? "@mirai-agent/mcp",
  crooUrl: process.env.NEXT_PUBLIC_CROO_MARKETPLACE_URL ?? "",
  githubUrl: "https://github.com/zakyirsyaad/mirai-ai",
};

export type McpClient = "claude" | "codex" | "hermes" | "json";

export const clientLabels: Record<McpClient, string> = {
  claude: "Claude Code/CLI",
  codex: "Codex",
  hermes: "Hermes",
  json: "Generic JSON",
};

export function buildMcpConfig(client: McpClient, apiUrl: string): string {
  const env = {
    MIRAI_RUNTIME_MODE: "hosted",
    MIRAI_API_URL: apiUrl,
  };
  const jsonConfig = {
    mcpServers: {
      mirai: {
        command: "mirai",
        args: ["mcp"],
        env,
      },
    },
  };

  if (client === "hermes") {
    return [
      "hermes mcp add mirai --command mirai --args mcp",
      `hermes mcp env mirai MIRAI_RUNTIME_MODE hosted`,
      `hermes mcp env mirai MIRAI_API_URL ${apiUrl}`,
      "hermes mcp test mirai",
    ].join("\n");
  }

  return JSON.stringify(jsonConfig, null, 2);
}
