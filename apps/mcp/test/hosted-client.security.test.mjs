import assert from "node:assert/strict";
import test from "node:test";
import * as hostedClient from "../dist/hosted-client.js";

test("unsafe API URL is rejected before reading or sending a license", async () => {
  assert.equal(typeof hostedClient.createHostedRequester, "function");
  let licenseReadCount = 0;
  let fetchCallCount = 0;
  const request = hostedClient.createHostedRequester({
    loadConfig: () => ({
      apiUrl: "http://attacker.example",
      licensePublicKey: "unused",
    }),
    readLocalLicense: async () => {
      licenseReadCount += 1;
      return "secret-license";
    },
    fetch: async () => {
      fetchCallCount += 1;
      throw new Error("fetch must not run");
    },
  });

  await assert.rejects(
    () => request("/mcp/campaign", { method: "GET" }),
    /HTTPS|loopback/i,
  );
  assert.equal(licenseReadCount, 0);
  assert.equal(fetchCallCount, 0);
});

test("credentialed hosted requests disable redirects", async () => {
  assert.equal(typeof hostedClient.createHostedRequester, "function");
  const calls = [];
  const request = hostedClient.createHostedRequester({
    loadConfig: () => ({
      apiUrl: "https://mirai.example",
      licensePublicKey: "unused",
    }),
    readLocalLicense: async () => "secret-license",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      };
    },
  });

  assert.deepEqual(await request("/mcp/campaign", { method: "GET" }), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mirai.example/mcp/campaign");
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-license");
});

test("missing license fails before network and generic API errors stay bounded", async () => {
  let fetchCallCount = 0;
  const missingLicenseRequest = hostedClient.createHostedRequester({
    loadConfig: () => ({ apiUrl: "https://mirai.example", licensePublicKey: "unused" }),
    readLocalLicense: async () => null,
    fetch: async () => {
      fetchCallCount += 1;
      throw new Error("fetch must not run");
    },
  });
  await assert.rejects(
    () => missingLicenseRequest("/mcp/campaign", { method: "GET" }),
    /not activated/i,
  );
  assert.equal(fetchCallCount, 0);

  const failedRequest = hostedClient.createHostedRequester({
    loadConfig: () => ({ apiUrl: "https://mirai.example", licensePublicKey: "unused" }),
    readLocalLicense: async () => "test-license",
    fetch: async () => ({
      ok: false,
      status: 502,
      json: async () => ({ message: "upstream detail" }),
    }),
  });
  await assert.rejects(
    () => failedRequest("/mcp/campaign", { method: "GET" }),
    /Mirai hosted API failed \(502\)/,
  );
});

test("only the expected X authorization endpoint may be opened", () => {
  assert.equal(typeof hostedClient.resolveXAuthorizationUrl, "function");
  for (const host of ["x.com", "twitter.com"]) {
    const value = `https://${host}/i/oauth2/authorize?state=test`;
    assert.equal(hostedClient.resolveXAuthorizationUrl(value), value);
  }
  for (const value of [
    "not-a-url",
    "http://x.com/i/oauth2/authorize?state=test",
    "https://attacker.example/i/oauth2/authorize?state=test",
    "https://x.com/not-oauth?state=test",
    "https://user:pass@x.com/i/oauth2/authorize?state=test",
  ]) {
    assert.throws(
      () => hostedClient.resolveXAuthorizationUrl(value),
      /authorization URL/i,
    );
  }
});
