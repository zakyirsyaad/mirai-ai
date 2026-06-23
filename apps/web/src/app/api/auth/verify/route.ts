import { SiweMessage } from "siwe";
import { consumeNonce } from "@/lib/nonce";
import { findSessionForWallet, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify — verify a SIWE signature and, if the wallet matches a
 * paid CROO order, log the buyer into their dashboard session.
 *
 * Body: { message: string, signature: string }
 */
export async function POST(req: Request): Promise<Response> {
  const { message, signature } = (await req.json()) as {
    message?: string;
    signature?: string;
  };
  if (!message || !signature) {
    return Response.json({ error: "missing message/signature" }, { status: 400 });
  }

  const expectedNonce = await consumeNonce();
  if (!expectedNonce) {
    return Response.json({ error: "nonce expired" }, { status: 400 });
  }

  let wallet: string;
  try {
    const siwe = new SiweMessage(message);
    const result = await siwe.verify({ signature, nonce: expectedNonce });
    if (!result.success) throw new Error("verify failed");
    wallet = result.data.address.toLowerCase();
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const sessionId = await findSessionForWallet(wallet);
  if (!sessionId) {
    return Response.json(
      {
        error:
          "No active order found for this wallet. Hire the agent on CROO with this wallet first.",
      },
      { status: 403 },
    );
  }

  await setSessionCookie(sessionId);
  return Response.json({ ok: true });
}
