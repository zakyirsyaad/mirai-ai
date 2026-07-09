import { loadEnv, decryptToken, encryptToken, isScraperXMode } from "@mirai/shared";
import { refreshTokens } from "@mirai/x";
import { prisma } from "@mirai/db";

/**
 * Per-campaign X credential access.
 *
 * Returns a valid access token for a campaign's connected X account, refreshing
 * (and re-encrypting) transparently when it's near expiry. Tokens are never
 * held in plaintext at rest — only decrypted in memory for the duration of a
 * stage.
 *
 * In scraper mode, returns the buyer's xbird cookies (auth_token|ct0) from
 * XConnection. Each buyer connects their own X account; posts go to their
 * timeline, not the operator's.
 */
const env = loadEnv();
const REFRESH_SKEW_MS = 60_000; // refresh if expiring within a minute

export interface XAccess {
  accessToken: string;
  xUserId: string;
  xHandle: string;
}

export async function getXAccess(campaignId: string): Promise<XAccess> {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { session: { include: { xConnection: true } } },
  });
  const conn = campaign.session.xConnection;
  if (!conn) {
    throw new Error(`Campaign ${campaignId} has no connected X account.`);
  }

  // Scraper mode: use buyer's xbird cookies from XConnection.
  if (isScraperXMode(env)) {
    if (!env.TOKEN_VAULT_KEY) {
      throw new Error("TOKEN_VAULT_KEY missing — cannot decrypt xbird cookies.");
    }
    if (!conn.encryptedXbirdAuthToken || !conn.encryptedXbirdCt0) {
      throw new Error(
        `Campaign ${campaignId} buyer has no xbird cookies. ` +
          `They need to connect their X account in scraper mode first.`,
      );
    }
    const authToken = decryptToken(conn.encryptedXbirdAuthToken, env.TOKEN_VAULT_KEY);
    const ct0 = decryptToken(conn.encryptedXbirdCt0, env.TOKEN_VAULT_KEY);
    return {
      // ScraperXClient expects "auth_token|ct0" format
      accessToken: `${authToken}|${ct0}`,
      xUserId: conn.xUserId,
      xHandle: conn.xHandle,
    };
  }

  if (!env.TOKEN_VAULT_KEY) {
    throw new Error("TOKEN_VAULT_KEY missing — cannot decrypt X tokens.");
  }

  const expiresAt = conn.accessTokenExpiresAt.getTime();
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) {
    return {
      accessToken: decryptToken(conn.encryptedAccessToken, env.TOKEN_VAULT_KEY),
      xUserId: conn.xUserId,
      xHandle: conn.xHandle,
    };
  }

  // Refresh.
  if (!env.X_CLIENT_ID) {
    throw new Error("X_CLIENT_ID missing — cannot refresh X tokens.");
  }
  const refreshToken = decryptToken(
    conn.encryptedRefreshToken,
    env.TOKEN_VAULT_KEY,
  );
  const fresh = await refreshTokens({
    refreshToken,
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
  });
  await prisma.xConnection.update({
    where: { id: conn.id },
    data: {
      encryptedAccessToken: encryptToken(fresh.accessToken, env.TOKEN_VAULT_KEY),
      encryptedRefreshToken: encryptToken(
        fresh.refreshToken,
        env.TOKEN_VAULT_KEY,
      ),
      accessTokenExpiresAt: new Date(fresh.expiresAt),
      scope: fresh.scope,
    },
  });
  return {
    accessToken: fresh.accessToken,
    xUserId: conn.xUserId,
    xHandle: conn.xHandle,
  };
}
