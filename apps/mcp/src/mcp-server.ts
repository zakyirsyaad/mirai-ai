import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  activateLicense,
  addContentItems,
  connectX,
  createCampaign,
  deleteContentItem,
  generateVoiceIdeas,
  getCampaign,
  getReport,
  healthcheck,
  listContentItems,
  pauseAutopost,
  resumeAutopost,
  setContentPolicy,
  setVoiceProfile,
  startAutopost,
  updateContentItem,
} from "./tools.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mirai",
    version: readPackageVersion(),
  });

  server.tool(
    "mirai_healthcheck",
    "Check Mirai local env, database, and activated license status.",
    {},
    async () => json(await healthcheck()),
  );

  server.tool(
    "mirai_activate_license",
    "Activate a Mirai CROO license key on this machine.",
    { licenseKey: z.string().min(1) },
    async ({ licenseKey }) => json(await activateLicense(licenseKey)),
  );

  server.tool(
    "mirai_connect_x",
    "Connect the user's X account with a local OAuth callback.",
    {},
    async () => json(await connectX()),
  );

  server.tool(
    "mirai_create_campaign",
    "Create or configure the local 7-day Mirai autopost campaign.",
    {
      contentMode: z
        .enum(["AUTONOMOUS", "USER_SUPPLIED"])
        .optional()
        .describe("AUTONOMOUS or USER_SUPPLIED"),
      niche: z.string().optional(),
      audience: z.string().optional(),
      goal: z.string().optional(),
      toneHint: z.string().optional(),
      contentPolicy: z
        .object({
          allowedTopics: z.array(z.string()).optional(),
          blockedTopics: z.array(z.string()).optional(),
          blockedPhrases: z.array(z.string()).optional(),
          language: z.enum(["any", "id", "en", "mixed"]).optional(),
          toneRules: z.array(z.string()).optional(),
          formatRules: z.array(z.string()).optional(),
          requireApprovalFor: z.array(z.string()).optional(),
        })
        .optional(),
    },
    async (args) => json(await createCampaign(args)),
  );

  server.tool(
    "mirai_set_voice_profile",
    "Set the campaign voice profile manually.",
    {
      tone: z.string(),
      topics: z.array(z.string()),
      styleNotes: z.array(z.string()),
      doNots: z.array(z.string()),
      sampleVoice: z.string(),
    },
    async (args) => json(await setVoiceProfile(args)),
  );

  server.tool(
    "mirai_set_content_policy",
    "Set hard filters for what Mirai may post automatically.",
    {
      allowedTopics: z.array(z.string()).optional(),
      blockedTopics: z.array(z.string()).optional(),
      blockedPhrases: z.array(z.string()).optional(),
      language: z.enum(["any", "id", "en", "mixed"]).optional(),
      toneRules: z.array(z.string()).optional(),
      formatRules: z.array(z.string()).optional(),
      requireApprovalFor: z.array(z.string()).optional(),
    },
    async (args) => json(await setContentPolicy(args)),
  );

  server.tool(
    "mirai_add_content_items",
    "Add raw content items for USER_SUPPLIED mode.",
    { items: z.array(z.string()).min(1).max(50) },
    async ({ items }) => json(await addContentItems(items)),
  );

  server.tool(
    "mirai_list_content_items",
    "List user-supplied content queue items and whether each one is still editable.",
    {},
    async () => json(await listContentItems()),
  );

  server.tool(
    "mirai_update_content_item",
    "Revise a pending user-supplied content item before Mirai uses it.",
    { itemId: z.string().min(1), rawText: z.string().min(1) },
    async (args) => json(await updateContentItem(args)),
  );

  server.tool(
    "mirai_delete_content_item",
    "Delete a pending user-supplied content item before Mirai uses it.",
    { itemId: z.string().min(1) },
    async ({ itemId }) => json(await deleteContentItem(itemId)),
  );

  server.tool(
    "mirai_start_autopost",
    "Approve once and start the 7-day autopost campaign.",
    { approved: z.boolean() },
    async ({ approved }) => json(await startAutopost(approved)),
  );

  server.tool(
    "mirai_pause_autopost",
    "Pause the current Mirai autopost campaign.",
    {},
    async () => json(await pauseAutopost()),
  );

  server.tool(
    "mirai_resume_autopost",
    "Resume the current Mirai autopost campaign after an entitlement check.",
    {},
    async () => json(await resumeAutopost()),
  );

  server.tool(
    "mirai_get_campaign",
    "Read campaign status and posting summary.",
    {},
    async () => json(await getCampaign()),
  );

  server.tool(
    "mirai_get_report",
    "Generate the local campaign proof-of-work report.",
    {},
    async () => json(await getReport()),
  );

  server.tool(
    "mirai_generate_voice_ideas",
    "Generate the Voice & Ideas read-only service deliverable.",
    {},
    async () => json(await generateVoiceIdeas()),
  );

  return server;
}

export async function runMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function readPackageVersion(): string {
  const value = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };
  if (typeof value.version !== "string" || !value.version) {
    throw new Error("Mirai package version is missing.");
  }
  return value.version;
}

function json(value: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}
