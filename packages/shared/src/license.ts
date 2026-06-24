import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { z } from "zod";
import { ServiceType } from "./requirements.js";

const LICENSE_PREFIX = "mirai_v1";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const LicenseScope = {
  CampaignCreate: "campaign:create",
  CampaignWrite: "campaign:write",
  XPost: "x:post",
  ReportRead: "report:read",
  VoiceIdeas: "voice:ideas",
} as const;
export type LicenseScope = (typeof LicenseScope)[keyof typeof LicenseScope];

export const LicenseLimitsSchema = z.object({
  posts: z.number().int().positive().optional(),
  ideas: z.number().int().positive().optional(),
});
export type LicenseLimits = z.infer<typeof LicenseLimitsSchema>;

export const LicensePayloadSchema = z.object({
  orderId: z.string().min(1),
  wallet: z.string().min(1).transform((v) => v.toLowerCase()),
  service: z.nativeEnum(ServiceType),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  scopes: z.array(z.nativeEnum(LicenseScope)).min(1),
  limits: LicenseLimitsSchema.default({}),
});
export type LicensePayload = z.infer<typeof LicensePayloadSchema>;

export interface VerifiedLicense {
  payload: LicensePayload;
  raw: string;
}

export function defaultScopesForService(service: ServiceType): LicenseScope[] {
  if (service === ServiceType.VoiceIdeas) {
    return [LicenseScope.ReportRead, LicenseScope.VoiceIdeas];
  }
  return [
    LicenseScope.CampaignCreate,
    LicenseScope.CampaignWrite,
    LicenseScope.XPost,
    LicenseScope.ReportRead,
  ];
}

export function defaultLimitsForService(service: ServiceType): LicenseLimits {
  if (service === ServiceType.VoiceIdeas) return { ideas: 30 };
  return { posts: 14 };
}

export function accessDurationMsForService(service: ServiceType): number {
  if (service === ServiceType.VoiceIdeas) return 24 * HOUR_MS;
  return 7 * DAY_MS;
}

export function calculateLicenseExpiresAt(
  service: ServiceType,
  issuedAt = new Date(),
): Date {
  return new Date(issuedAt.getTime() + accessDurationMsForService(service));
}

export function createLicensePayload(args: {
  orderId: string;
  wallet: string;
  service: ServiceType;
  issuedAt: Date;
  expiresAt: Date;
}): LicensePayload {
  return LicensePayloadSchema.parse({
    orderId: args.orderId,
    wallet: args.wallet,
    service: args.service,
    issuedAt: args.issuedAt.toISOString(),
    expiresAt: args.expiresAt.toISOString(),
    scopes: defaultScopesForService(args.service),
    limits: defaultLimitsForService(args.service),
  });
}

export function signLicense(
  payload: LicensePayload,
  privateKeyPem: string,
): string {
  const parsed = LicensePayloadSchema.parse(payload);
  const payloadB64 = base64urlEncode(
    Buffer.from(JSON.stringify(parsed), "utf8"),
  );
  const signature = cryptoSign(
    null,
    Buffer.from(payloadB64, "utf8"),
    createPrivateKey(normalizePem(privateKeyPem)),
  );
  return `${LICENSE_PREFIX}.${payloadB64}.${base64urlEncode(signature)}`;
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
  normalized = normalized.replace(/\\n/g, "\n").trim();
  return normalized;
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

export function assertLicenseScope(
  payload: LicensePayload,
  scope: LicenseScope,
): void {
  if (!payload.scopes.includes(scope)) {
    throw new Error(`Mirai license does not include required scope: ${scope}`);
  }
}

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(value: string): Buffer {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
