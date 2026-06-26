import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  createEntitlementRequestHandler,
  type HostedHandlers,
} from "./entitlement-handler.js";

async function startLocalE2E(handlers: HostedHandlers): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer(createEntitlementRequestHandler(handlers));
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

test("local entitlement API smoke flow covers health, activation, and report retrieval", async () => {
  const calls: string[] = [];
  const handlers: HostedHandlers = {
    checkEntitlement: async () => {
      calls.push("checkEntitlement");
      return { ok: true, payload: { wallet: "0xabc" } } as never;
    },
    hostedActivate: async (licenseKey) => {
      calls.push(`activate:${licenseKey}`);
      return { ok: true, campaignId: "campaign-e2e" };
    },
    hostedAddContentItems: async () => ({ ok: true }),
    hostedDeleteContentItem: async () => ({ ok: true }),
    hostedListContentItems: async () => ({ ok: true }),
    hostedUpdateContentItem: async () => ({ ok: true }),
    hostedConnectX: async () => ({ ok: true }),
    hostedCreateCampaign: async () => ({ ok: true }),
    hostedGenerateVoiceIdeas: async () => ({ ok: true }),
    hostedGetCampaign: async () => ({ ok: true }),
    hostedGetReport: async (licenseKey) => {
      calls.push(`report:${licenseKey}`);
      return { ok: true, report: { campaignId: "campaign-e2e" } };
    },
    hostedHealth: async () => {
      calls.push("health");
      return { ok: true, service: "mirai-hosted-api", db: "test" };
    },
    hostedPauseAutopost: async () => ({ ok: true }),
    hostedResumeAutopost: async () => ({ ok: true }),
    hostedSetContentPolicy: async () => ({ ok: true }),
    hostedSetVoiceProfile: async () => ({ ok: true }),
    hostedStartAutopost: async () => ({ ok: true }),
    hostedXCallback: async () => "ok",
  };
  const server = await startLocalE2E(handlers);

  try {
    const health = await fetch(`${server.baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = (await health.json()) as { service: string };
    assert.equal(healthBody.service, "mirai-hosted-api");

    const activation = await fetch(`${server.baseUrl}/mcp/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ licenseKey: "mirai-license-e2e" }),
    });
    assert.equal(activation.status, 200);
    const activationBody = (await activation.json()) as { campaignId: string };
    assert.equal(activationBody.campaignId, "campaign-e2e");

    const report = await fetch(`${server.baseUrl}/mcp/report`, {
      headers: { authorization: "Bearer mirai-license-e2e" },
    });
    assert.equal(report.status, 200);
    assert.deepEqual(await report.json(), {
      ok: true,
      report: { campaignId: "campaign-e2e" },
    });
    assert.deepEqual(calls, [
      "health",
      "activate:mirai-license-e2e",
      "report:mirai-license-e2e",
    ]);
  } finally {
    await server.close();
  }
});
