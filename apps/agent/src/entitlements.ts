import { prisma, EntitlementStatus, type Prisma } from "@mirai/db";
import {
  createLicensePayload,
  loadEnv,
  parseLicenseUnsafe,
  signLicense,
  verifyLicense,
  type LicensePayload,
  calculateLicenseExpiresAt,
} from "@mirai/shared";

const env = loadEnv();

export type SensitiveAction = "activate" | "start" | "resume" | "post" | "deliver";

export async function createEntitlementForOrder(args: {
  tx: Prisma.TransactionClient;
  orderId: string;
  crooOrderId: string;
  buyerWallet: string;
  service: LicensePayload["service"];
  issuedAt?: Date;
}): Promise<{ licenseKey: string; issuedAt: Date; expiresAt: Date } | null> {
  if (!env.MIRAI_LICENSE_PRIVATE_KEY) {
    console.warn(
      "[entitlement] MIRAI_LICENSE_PRIVATE_KEY missing; skipping license issue.",
    );
    return null;
  }

  const issuedAt = args.issuedAt ?? new Date();
  const expiresAt = calculateLicenseExpiresAt(args.service, issuedAt);
  const payload = createLicensePayload({
    orderId: args.crooOrderId,
    wallet: args.buyerWallet,
    service: args.service,
    issuedAt,
    expiresAt,
  });
  const licenseKey = signLicense(payload, env.MIRAI_LICENSE_PRIVATE_KEY);

  await args.tx.entitlement.create({
    data: {
      orderId: args.orderId,
      crooOrderId: args.crooOrderId,
      buyerWallet: payload.wallet,
      service: payload.service,
      licenseKey,
      issuedAt,
      expiresAt,
      scopes: payload.scopes,
      limits: payload.limits,
      status: EntitlementStatus.ACTIVE,
    },
  });
  return { licenseKey, issuedAt, expiresAt };
}

export async function checkEntitlement(args: {
  licenseKey: string;
  action: SensitiveAction;
}): Promise<{ ok: true; payload: LicensePayload } | { ok: false; reason: string }> {
  if (!env.MIRAI_LICENSE_PUBLIC_KEY) {
    return { ok: false, reason: "MIRAI_LICENSE_PUBLIC_KEY is not configured." };
  }

  let payload: LicensePayload;
  try {
    payload = verifyLicense(args.licenseKey, env.MIRAI_LICENSE_PUBLIC_KEY).payload;
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "invalid license",
    };
  }

  const entitlement = await prisma.entitlement.findUnique({
    where: { crooOrderId: payload.orderId },
  });
  if (!entitlement) return { ok: false, reason: "entitlement not found" };
  if (entitlement.licenseKey !== args.licenseKey) {
    return { ok: false, reason: "license does not match entitlement" };
  }
  if (entitlement.status === EntitlementStatus.REVOKED) {
    return { ok: false, reason: "entitlement was revoked" };
  }
  if (entitlement.expiresAt.getTime() <= Date.now()) {
    await prisma.entitlement.update({
      where: { id: entitlement.id },
      data: {
        status: EntitlementStatus.EXPIRED,
        lastCheckedAt: new Date(),
      },
    });
    return { ok: false, reason: `entitlement expired at ${entitlement.expiresAt.toISOString()}` };
  }

  await prisma.entitlement.update({
    where: { id: entitlement.id },
    data: {
      activatedAt: args.action === "activate" ? new Date() : entitlement.activatedAt,
      lastCheckedAt: new Date(),
    },
  });
  return { ok: true, payload };
}

export async function checkCampaignEntitlement(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { order: { include: { entitlement: true } } },
  });
  const entitlement = campaign.order.entitlement;
  if (!entitlement) {
    if (campaign.accessExpiresAt.getTime() <= Date.now()) {
      throw new Error("Campaign access window has expired.");
    }
    return;
  }
  const result = await checkEntitlement({
    licenseKey: entitlement.licenseKey,
    action: "post",
  });
  if (!result.ok) throw new Error(result.reason);
}

export function summarizeLicenseForLogs(licenseKey: string): string {
  try {
    const payload = parseLicenseUnsafe(licenseKey);
    return `${payload.orderId} expires=${payload.expiresAt}`;
  } catch {
    return "unparseable license";
  }
}
