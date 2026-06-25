import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  createEntitlementRequestHandler,
  type HostedHandlers,
} from "./entitlement-handler.js";

function testHandlers(
  overrides: Partial<HostedHandlers> = {},
): HostedHandlers {
  const notUsed = async (): Promise<never> => {
    throw new Error("handler should not be called");
  };
  return {
    checkEntitlement: async () => ({ ok: true, payload: { wallet: "0x1" } }) as never,
    hostedActivate: notUsed,
    hostedAddContentItems: notUsed,
    hostedConnectX: notUsed,
    hostedCreateCampaign: notUsed,
    hostedGenerateVoiceIdeas: notUsed,
    hostedGetCampaign: notUsed,
    hostedGetReport: notUsed,
    hostedHealth: async () => ({ ok: true, db: "test" }),
    hostedPauseAutopost: notUsed,
    hostedResumeAutopost: notUsed,
    hostedSetContentPolicy: notUsed,
    hostedSetVoiceProfile: notUsed,
    hostedStartAutopost: notUsed,
    hostedXCallback: notUsed,
    ...overrides,
  };
}

async function withServer<T>(
  handlers: HostedHandlers,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(createEntitlementRequestHandler(handlers));
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /health returns hosted health JSON", async () => {
  await withServer(testHandlers(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, db: "test" });
  });
});

test("POST /mcp/campaign requires Bearer license before reading campaign body", async () => {
  let campaignCalled = false;
  await withServer(
    testHandlers({
      hostedCreateCampaign: async () => {
        campaignCalled = true;
        return { ok: true };
      },
    }),
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp/campaign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ niche: "Base" }),
      });

      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: "Bearer license required",
      });
      assert.equal(campaignCalled, false);
    },
  );
});

test("POST /entitlements/check rejects missing license or action", async () => {
  await withServer(testHandlers(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/entitlements/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ licenseKey: "mirai" }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "licenseKey and action required",
    });
  });
});
