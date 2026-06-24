import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { z } from "zod";

const LICENSE_PREFIX = "mirai_v1";

export const ServiceType = {
  ContentAgent7d: "content-agent-7d",
  VoiceIdeas: "voice-ideas",
} as const;

export const LicenseScope = {
  CampaignCreate: "campaign:create",
  CampaignWrite: "campaign:write",
  XPost: "x:post",
  ReportRead: "report:read",
  VoiceIdeas: "voice:ideas",
} as const;

const LicensePayloadSchema = z.object({
  orderId: z.string().min(1),
  wallet: z.string().min(1).transform((v) => v.toLowerCase()),
  service: z.nativeEnum(ServiceType),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  scopes: z.array(z.nativeEnum(LicenseScope)).min(1),
  limits: z
    .object({
      posts: z.number().int().positive().optional(),
      ideas: z.number().int().positive().optional(),
    })
    .default({}),
});

export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

export interface VerifiedLicense {
  payload: LicensePayload;
  raw: string;
}

export function verifyLicense(
  licenseKey: string,
  publicKeyPem: string,
  now = new Date(),
): VerifiedLicense {
  const [prefix, payloadB64, signatureB64, extra] = licenseKey.split(".");
  if (
    prefix !== LICENSE_PREFIX ||
    !payloadB64 ||
    !signatureB64 ||
    extra !== undefined
  ) {
    throw new Error("Malformed Mirai license key.");
  }

  const ok = cryptoVerify(
    null,
    Buffer.from(payloadB64, "utf8"),
    createPublicKey(normalizePem(publicKeyPem)),
    base64urlDecode(signatureB64),
  );
  if (!ok) throw new Error("Mirai license signature is invalid.");

  const payload = LicensePayloadSchema.parse(
    JSON.parse(base64urlDecode(payloadB64).toString("utf8")),
  );
  if (Date.parse(payload.expiresAt) <= now.getTime()) {
    throw new Error(`Mirai license expired at ${payload.expiresAt}.`);
  }

  return { payload, raw: licenseKey };
}

export function parseLicenseUnsafe(licenseKey: string): LicensePayload {
  const [prefix, payloadB64] = licenseKey.split(".");
  if (prefix !== LICENSE_PREFIX || !payloadB64) {
    throw new Error("Malformed Mirai license key.");
  }
  return LicensePayloadSchema.parse(
    JSON.parse(base64urlDecode(payloadB64).toString("utf8")),
  );
}

function normalizePem(value: string): string {
  let normalized = value.trim();
  if (normalized.startsWith("base64:")) {
    normalized = Buffer.from(normalized.slice("base64:".length), "base64")
      .toString("utf8")
      .trim();
  }
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }
  return normalized.replace(/\\n/g, "\n").trim();
}

function base64urlDecode(value: string): Buffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
