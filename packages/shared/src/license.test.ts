import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  LicenseScope,
  assertLicenseScope,
  calculateLicenseExpiresAt,
  createLicensePayload,
  signLicense,
  verifyLicense,
} from "./license.js";
import { LicenseDeliverySchema, ServiceType } from "./requirements.js";

test("signs and verifies a Mirai license", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = createLicensePayload({
    orderId: "croo-order-1",
    wallet: "0xABC",
    service: ServiceType.ContentAgent7d,
    issuedAt: new Date("2026-06-24T00:00:00Z"),
    expiresAt: new Date("2026-07-01T00:00:00Z"),
  });

  const license = signLicense(
    payload,
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  );
  const verified = verifyLicense(
    license,
    publicKey.export({ format: "pem", type: "spki" }).toString(),
    new Date("2026-06-25T00:00:00Z"),
  );

  assert.equal(verified.payload.orderId, "croo-order-1");
  assert.equal(verified.payload.wallet, "0xabc");
  assertLicenseScope(verified.payload, LicenseScope.XPost);
});

test("rejects tampered license payloads", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = createLicensePayload({
    orderId: "croo-order-2",
    wallet: "0xabc",
    service: ServiceType.ContentAgent7d,
    issuedAt: new Date("2026-06-24T00:00:00Z"),
    expiresAt: new Date("2026-07-01T00:00:00Z"),
  });
  const license = signLicense(
    payload,
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  );
  const parts = license.split(".");
  assert.equal(parts.length, 3);
  const tampered = `${parts[0]}.${parts[1]?.replace(/.$/, "A")}.${parts[2]}`;

  assert.throws(
    () =>
      verifyLicense(
        tampered,
        publicKey.export({ format: "pem", type: "spki" }).toString(),
        new Date("2026-06-25T00:00:00Z"),
      ),
    /signature is invalid|Unexpected token|license/i,
  );
});

test("rejects expired licenses", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const payload = createLicensePayload({
    orderId: "croo-order-3",
    wallet: "0xabc",
    service: ServiceType.VoiceIdeas,
    issuedAt: new Date("2026-06-24T00:00:00Z"),
    expiresAt: new Date("2026-06-25T00:00:00Z"),
  });
  const license = signLicense(
    payload,
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  );

  assert.throws(
    () =>
      verifyLicense(
        license,
        publicKey.export({ format: "pem", type: "spki" }).toString(),
        new Date("2026-06-26T00:00:00Z"),
      ),
    /expired/,
  );
});

test("calculates service access windows independently from CROO SLA", () => {
  const issuedAt = new Date("2026-06-24T10:00:00Z");

  assert.equal(
    calculateLicenseExpiresAt(ServiceType.ContentAgent7d, issuedAt).toISOString(),
    "2026-07-01T10:00:00.000Z",
  );
  assert.equal(
    calculateLicenseExpiresAt(ServiceType.VoiceIdeas, issuedAt).toISOString(),
    "2026-06-25T10:00:00.000Z",
  );
});

test("validates CROO license delivery payloads", () => {
  const parsed = LicenseDeliverySchema.parse({
    type: "mirai-license",
    service: ServiceType.ContentAgent7d,
    orderId: "croo-order-4",
    licenseKey: "mirai_v1.payload.signature",
    expiresAt: "2026-07-01T10:00:00.000Z",
    installCommand: "npm install -g @mirai-agent/mcp",
    docsUrl: "https://github.com/0xAlvary/mirai-ai#mirai-ai",
    nextSteps: "Activate the license from the Mirai plugin/profile.",
  });

  assert.equal(parsed.service, ServiceType.ContentAgent7d);
});
