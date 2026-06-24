import {
  prisma,
  CampaignStatus,
  ContentMode,
  EntitlementStatus,
} from "@mirai/db";
import {
  ServiceType,
  assertLicenseScope,
  LicenseScope,
} from "@mirai/shared";
import { requireVerifiedLicense } from "./license-store.js";

export interface LocalAccess {
  licenseKey: string;
  orderId: string;
  sessionId: string;
  campaignId: string | null;
  expiresAt: Date;
  service: ServiceType;
}

export async function ensureLocalAccess(
  scope?: LicenseScope,
): Promise<LocalAccess> {
  const verified = await requireVerifiedLicense();
  const payload = verified.payload;
  if (scope) assertLicenseScope(payload, scope);

  const expiresAt = new Date(payload.expiresAt);
  const existing = await prisma.order.findUnique({
    where: { crooOrderId: payload.orderId },
    include: { session: true, campaign: true, entitlement: true },
  });
  if (existing?.session) {
    if (!existing.entitlement) {
      await prisma.entitlement.create({
        data: {
          orderId: existing.id,
          crooOrderId: payload.orderId,
          buyerWallet: payload.wallet,
          service: payload.service,
          licenseKey: verified.raw,
          issuedAt: new Date(payload.issuedAt),
          expiresAt,
          scopes: payload.scopes,
          limits: payload.limits,
          status: EntitlementStatus.ACTIVE,
        },
      });
    }
    const campaign =
      existing.campaign ??
      (payload.service === ServiceType.ContentAgent7d
        ? await prisma.campaign.create({
            data: {
              orderId: existing.id,
              sessionId: existing.session.id,
              contentMode: ContentMode.AUTONOMOUS,
              enabled: true,
              status: CampaignStatus.WAITING_FOR_X,
              accessExpiresAt: expiresAt,
            },
          })
        : null);
    return {
      licenseKey: verified.raw,
      orderId: existing.id,
      sessionId: existing.session.id,
      campaignId: campaign?.id ?? null,
      expiresAt,
      service: payload.service,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.accessSession.create({
      data: {
        buyerWallet: payload.wallet,
        accessExpiresAt: expiresAt,
      },
    });
    const order = await tx.order.create({
      data: {
        crooOrderId: payload.orderId,
        buyerWallet: payload.wallet,
        service: payload.service,
        sessionId: session.id,
      },
    });
    await tx.entitlement.create({
      data: {
        orderId: order.id,
        crooOrderId: payload.orderId,
        buyerWallet: payload.wallet,
        service: payload.service,
        licenseKey: verified.raw,
        issuedAt: new Date(payload.issuedAt),
        expiresAt,
        scopes: payload.scopes,
        limits: payload.limits,
        status: EntitlementStatus.ACTIVE,
      },
    });

    const campaign =
      payload.service === ServiceType.ContentAgent7d
        ? await tx.campaign.create({
            data: {
              orderId: order.id,
              sessionId: session.id,
              contentMode: ContentMode.AUTONOMOUS,
              enabled: true,
              status: CampaignStatus.WAITING_FOR_X,
              accessExpiresAt: expiresAt,
            },
          })
        : null;
    return { order, session, campaign };
  });

  return {
    licenseKey: verified.raw,
    orderId: created.order.id,
    sessionId: created.session.id,
    campaignId: created.campaign?.id ?? null,
    expiresAt,
    service: payload.service,
  };
}
