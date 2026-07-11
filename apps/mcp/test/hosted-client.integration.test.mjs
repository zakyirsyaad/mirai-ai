import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("hosted tool surface sends authenticated requests to a safe API origin", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "mirai-hosted-client-"));
  const originalHome = process.env.HOME;
  const originalApiUrl = process.env.MIRAI_API_URL;
  const originalPublicKey = process.env.MIRAI_LICENSE_PUBLIC_KEY;
  let calls = [];
  let reportRequests = 0;
  const server = createServer(async (req, res) => {
    let rawBody = "";
    for await (const chunk of req) rawBody += chunk.toString();
    const body = rawBody ? JSON.parse(rawBody) : null;
    const call = {
      authorization: req.headers.authorization ?? null,
      body,
      method: req.method,
      path: req.url,
    };
    calls = [...calls, call];

    if (req.url === "/mcp/report") {
      reportRequests += 1;
      if (reportRequests === 1) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "report denied" }));
        return;
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        req.url === "/health"
          ? { ok: true, service: "test-api" }
          : { ok: true, method: req.method, path: req.url },
      ),
    );
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const { licenseKey, publicKey } = createTestLicense();
    process.env.HOME = homeDir;
    process.env.MIRAI_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.MIRAI_LICENSE_PUBLIC_KEY = publicKey;

    const tools = await import(`../dist/tools.js?integration=${Date.now()}`);
    const licenseStore = await import(
      `../dist/license-store.js?integration=${Date.now()}`
    );

    assert.equal(await licenseStore.readLocalLicense(), null);
    assert.equal(await licenseStore.getLocalLicensePayload(), null);
    await assert.rejects(
      () => licenseStore.requireVerifiedLicense(),
      /not activated/i,
    );
    await licenseStore.writeLocalLicense("invalid-license");
    assert.equal(await licenseStore.getLocalLicensePayload(), null);
    await assert.rejects(
      () => licenseStore.requireVerifiedLicense(),
      /Malformed/,
    );

    assert.deepEqual(await tools.activateLicense(licenseKey), {
      ok: true,
      method: "POST",
      path: "/mcp/activate",
    });
    assert.equal(
      await readFile(join(homeDir, ".mirai", "license"), "utf8"),
      `${licenseKey}\n`,
    );
    assert.equal((await licenseStore.requireVerifiedLicense()).raw, licenseKey);
    assert.equal((await licenseStore.getLocalLicensePayload()).orderId, "order-test");

    await tools.healthcheck();
    await tools.connectX();
    await tools.createCampaign({ niche: "security" });
    await tools.setVoiceProfile({
      tone: "direct",
      topics: ["security"],
      styleNotes: ["concise"],
      doNots: ["links"],
      sampleVoice: "Ship safely.",
    });
    await tools.setContentPolicy({ allowedTopics: ["security"] });
    await tools.addContentItems(["secure release"]);
    await tools.listContentItems();
    await tools.updateContentItem({ itemId: "item-1", rawText: "safer release" });
    await tools.deleteContentItem("item-1");
    await tools.startAutopost(true);
    await tools.pauseAutopost();
    await tools.resumeAutopost();
    await tools.getCampaign();
    await assert.rejects(() => tools.getReport(), /report denied/);
    await tools.getReport();
    await tools.generateVoiceIdeas();

    assert.ok(calls.some((call) => call.path === "/health" && call.authorization === null));
    assert.ok(
      calls
        .filter((call) => call.path !== "/health" && call.path !== "/mcp/activate")
        .every((call) => call.authorization === `Bearer ${licenseKey}`),
    );
    assert.ok(calls.some((call) => call.method === "PATCH"));
    assert.ok(calls.some((call) => call.method === "DELETE"));
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    restoreEnv("HOME", originalHome);
    restoreEnv("MIRAI_API_URL", originalApiUrl);
    restoreEnv("MIRAI_LICENSE_PUBLIC_KEY", originalPublicKey);
    await rm(homeDir, { recursive: true, force: true });
  }
});

function createTestLicense() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const now = Date.now();
  const payload = {
    orderId: "order-test",
    wallet: "0xabc",
    service: "content-agent-7d",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    scopes: ["campaign:create", "campaign:write", "x:post", "report:read"],
    limits: { posts: 14 },
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(payloadB64), privateKey).toString("base64url");
  return {
    licenseKey: `mirai_v1.${payloadB64}.${signature}`,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
