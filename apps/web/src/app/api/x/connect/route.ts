import { loadEnv } from "@mirai/shared";
import { buildAuthorizeUrl, createPkcePair, createState } from "@mirai/x";
import { getActiveSession } from "@/lib/session";
import { stashOAuth } from "@/lib/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/x/connect — begin the X OAuth2 PKCE flow. Requires an authenticated
 * dashboard session; redirects the buyer to X for consent.
 */
export async function GET(): Promise<Response> {
  const session = await getActiveSession();
  if (!session) {
    return Response.json({ error: "not authenticated" }, { status: 401 });
  }

  const env = loadEnv();
  if (!env.X_CLIENT_ID) {
    return Response.json(
      { error: "X is not configured (set X_CLIENT_ID / X_MODE=real)." },
      { status: 503 },
    );
  }

  const { verifier, challenge } = createPkcePair();
  const state = createState();
  await stashOAuth(verifier, state);

  const url = buildAuthorizeUrl({
    clientId: env.X_CLIENT_ID,
    redirectUri: env.X_OAUTH_REDIRECT_URI,
    state,
    challenge,
  });
  return Response.redirect(url, 302);
}
