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
    hostedDeleteContentItem: notUsed,
    hostedListContentItems: notUsed,
    hostedUpdateContentItem: notUsed,
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

test("content queue endpoints support list, update, and delete", async () => {
  const calls: string[] = [];
  await withServer(
    testHandlers({
      hostedListContentItems: async (licenseKey) => {
        calls.push(`list:${licenseKey}`);
        return { ok: true, items: [{ id: "item-1", status: "PENDING" }] };
      },
      hostedUpdateContentItem: async (licenseKey, itemId, rawText) => {
        calls.push(`update:${licenseKey}:${itemId}:${rawText}`);
        return { ok: true, item: { id: itemId, rawText, status: "PENDING" } };
      },
      hostedDeleteContentItem: async (licenseKey, itemId) => {
        calls.push(`delete:${licenseKey}:${itemId}`);
        return { ok: true, deleted: itemId };
      },
    }),
    async (baseUrl) => {
      const headers = { authorization: "Bearer mirai-license" };

      const list = await fetch(`${baseUrl}/mcp/content`, { headers });
      assert.equal(list.status, 200);
      assert.deepEqual(await list.json(), {
        ok: true,
        items: [{ id: "item-1", status: "PENDING" }],
      });

      const update = await fetch(`${baseUrl}/mcp/content/item-1`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ rawText: "revised post" }),
      });
      assert.equal(update.status, 200);
      assert.deepEqual(await update.json(), {
        ok: true,
        item: { id: "item-1", rawText: "revised post", status: "PENDING" },
      });

      const deletion = await fetch(`${baseUrl}/mcp/content/item-1`, {
        method: "DELETE",
        headers,
      });
      assert.equal(deletion.status, 200);
      assert.deepEqual(await deletion.json(), {
        ok: true,
        deleted: "item-1",
      });

      assert.deepEqual(calls, [
        "list:mirai-license",
        "update:mirai-license:item-1:revised post",
        "delete:mirai-license:item-1",
      ]);
    },
  );
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
