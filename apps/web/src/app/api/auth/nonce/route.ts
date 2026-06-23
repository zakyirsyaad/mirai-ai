import { issueNonce } from "@/lib/nonce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/nonce — issue a SIWE nonce (also set as an httpOnly cookie). */
export async function GET(): Promise<Response> {
  const nonce = await issueNonce();
  return new Response(nonce, {
    headers: { "content-type": "text/plain" },
  });
}
