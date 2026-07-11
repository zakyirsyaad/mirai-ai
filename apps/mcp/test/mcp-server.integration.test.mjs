import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import * as mcpServerModule from "../dist/mcp-server.js";

const EXPECTED_TOOLS = [
  "mirai_activate_license",
  "mirai_add_content_items",
  "mirai_connect_x",
  "mirai_create_campaign",
  "mirai_delete_content_item",
  "mirai_generate_voice_ideas",
  "mirai_get_campaign",
  "mirai_get_report",
  "mirai_healthcheck",
  "mirai_list_content_items",
  "mirai_pause_autopost",
  "mirai_resume_autopost",
  "mirai_set_content_policy",
  "mirai_set_voice_profile",
  "mirai_start_autopost",
  "mirai_update_content_item",
].sort();

test("MCP handshake version matches package and registry exposes all tools", async () => {
  assert.equal(typeof mcpServerModule.createMcpServer, "function");
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const server = mcpServerModule.createMcpServer();
  const client = new Client({ name: "mirai-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal(client.getServerVersion()?.version, packageJson.version);
    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map(({ name }) => name).sort(),
      EXPECTED_TOOLS,
    );
  } finally {
    await client.close();
    await server.close();
  }
});
