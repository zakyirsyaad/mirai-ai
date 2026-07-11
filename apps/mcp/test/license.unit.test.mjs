import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { parseLicenseUnsafe, verifyLicense } from "../dist/license.js";

test("license parser verifies signature and normalizes wallet", () => {
  const fixture = createLicenseFixture(Date.now() + 60_000);
  const verified = verifyLicense(fixture.licenseKey, fixture.publicKey);
  assert.equal(verified.payload.wallet, "0xabc");
  assert.equal(parseLicenseUnsafe(fixture.licenseKey).orderId, "order-test");
  const encodedPublicKey = `base64:${Buffer.from(fixture.publicKey).toString("base64")}`;
  assert.equal(verifyLicense(fixture.licenseKey, encodedPublicKey).payload.orderId, "order-test");
});

test("license verification rejects malformed, tampered, and expired values", () => {
  const fixture = createLicenseFixture(Date.now() + 60_000);
  const expired = createLicenseFixture(Date.now() - 1_000);
  assert.throws(() => verifyLicense("invalid", fixture.publicKey), /Malformed/);
  assert.throws(
    () => verifyLicense(`${fixture.licenseKey}tampered`, fixture.publicKey),
    /signature|Malformed/,
  );
  assert.throws(() => verifyLicense(expired.licenseKey, expired.publicKey), /expired/);
  assert.throws(() => parseLicenseUnsafe("invalid"), /Malformed/);
});

function createLicenseFixture(expiresAt) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = {
    orderId: "order-test",
    wallet: "0xAbC",
    service: "content-agent-7d",
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    scopes: ["campaign:create"],
    limits: { posts: 14 },
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(payloadB64), privateKey).toString("base64url");
  return {
    licenseKey: `mirai_v1.${payloadB64}.${signature}`,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
