import { loadEnv, encryptToken, safeEqual } from "@mirai/shared";
import { exchangeCodeForTokens, createXClient } from "@mirai/x";
import { prisma, CampaignStatus } from "@mirai/db";
import { getActiveSession } from "@/lib/session";
import { readOAuth, clearOAuth } from "@/lib/oauth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/x/callback — handle the X OAuth redirect: validate state, exchange
 * the code, encrypt + store tokens, capture the X identity, and flip any
 * WAITING_FOR_X campaigns to ready (the agent's scheduler picks them up).
 */
export async function GET(req: Request): Promise<Response> {
  const env = loadEnv();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const dashboard = `${env.WEB_BASE_URL}/dashboard`;

  const session = await getActiveSession();
  if (!session) return Response.redirect(`${env.WEB_BASE_URL}/?error=auth`, 302);

  const { verifier, state: savedState } = await readOAuth();
  await clearOAuth();
  if (!code || !state || !savedState || !verifier || !safeEqual(state, savedState)) {
    return Response.redirect(`${dashboard}?error=oauth_state`, 302);
  }
  if (!env.X_CLIENT_ID || !env.TOKEN_VAULT_KEY) {
    return Response.redirect(`${dashboard}?error=x_not_configured`, 302);
  }

  const tokens = await exchangeCodeForTokens({
    code,
    verifier,
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    redirectUri: env.X_OAUTH_REDIRECT_URI,
  });

  // Identify the connected account (and detect cold-start via tweetCount).
  const x = createXClient(env);
  const me = await x.getMe(tokens.accessToken);

  await prisma.xConnection.upsert({
    where: { sessionId: session.id },
    create: {
      sessionId: session.id,
      xUserId: me.id,
      xHandle: me.username,
      encryptedAccessToken: encryptToken(tokens.accessToken, env.TOKEN_VAULT_KEY),
      encryptedRefreshToken: encryptToken(tokens.refreshToken, env.TOKEN_VAULT_KEY),
      scope: tokens.scope,
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      tweetCount: me.tweetCount,
    },
    update: {
      xUserId: me.id,
      xHandle: me.username,
      encryptedAccessToken: encryptToken(tokens.accessToken, env.TOKEN_VAULT_KEY),
      encryptedRefreshToken: encryptToken(tokens.refreshToken, env.TOKEN_VAULT_KEY),
      scope: tokens.scope,
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      tweetCount: me.tweetCount,
    },
  });

  // Mark campaigns waiting on X as ready to (re)start.
  await prisma.campaign.updateMany({
    where: { sessionId: session.id, status: CampaignStatus.WAITING_FOR_X },
    data: { status: CampaignStatus.WAITING_FOR_X },
  });

  const coldStart = me.tweetCount === 0;
  return Response.redirect(
    `${dashboard}?x=connected${coldStart ? "&onboarding=1" : ""}`,
    302,
  );
}
