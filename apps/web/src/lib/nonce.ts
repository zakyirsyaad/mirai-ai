import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

/**
 * SIWE nonce handling. The nonce is generated server-side, stored in a
 * short-lived httpOnly cookie, and must match the one embedded in the signed
 * SIWE message — preventing replay.
 */
const NONCE_COOKIE = "mirai_siwe_nonce";

export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });
  return nonce;
}

export async function consumeNonce(): Promise<string | null> {
  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value ?? null;
  if (nonce) jar.delete(NONCE_COOKIE);
  return nonce;
}
