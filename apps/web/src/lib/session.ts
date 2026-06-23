import { cookies } from "next/headers";
import { prisma, SessionStatus } from "@mirai/db";

/**
 * Dashboard session lookup.
 *
 * Identity is wallet-as-identity: after a buyer proves wallet ownership (SIWE),
 * we set a signed cookie carrying their DashboardSession id. The session is the
 * one provisioned by the agent on OrderPaid, matched by buyerWallet — so the
 * buyer reaches exactly the campaign they paid for, with no link delivery.
 */
const COOKIE = "mirai_session";

export async function setSessionCookie(sessionId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export interface ActiveSession {
  id: string;
  buyerWallet: string;
  accessExpiresAt: Date;
}

/** Return the current valid session, or null. Expired sessions are rejected. */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  const session = await prisma.dashboardSession.findUnique({ where: { id } });
  if (!session) return null;
  if (session.status !== SessionStatus.ACTIVE) return null;
  if (session.accessExpiresAt.getTime() < Date.now()) {
    await prisma.dashboardSession.update({
      where: { id },
      data: { status: SessionStatus.EXPIRED },
    });
    return null;
  }
  return {
    id: session.id,
    buyerWallet: session.buyerWallet,
    accessExpiresAt: session.accessExpiresAt,
  };
}

/**
 * Find the active, paid session for a verified wallet. Called after SIWE
 * verification — the wallet must match a buyerWallet from a CROO order.
 */
export async function findSessionForWallet(
  wallet: string,
): Promise<string | null> {
  const session = await prisma.dashboardSession.findFirst({
    where: {
      buyerWallet: wallet.toLowerCase(),
      status: SessionStatus.ACTIVE,
      accessExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  return session?.id ?? null;
}
