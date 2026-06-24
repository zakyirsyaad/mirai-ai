import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { encryptToken, loadEnv, safeEqual } from "@mirai/shared";
import {
  buildAuthorizeUrl,
  createPkcePair,
  createState,
  createXClient,
  exchangeCodeForTokens,
} from "@mirai/x";
import { prisma } from "@mirai/db";
import { ensureLocalAccess } from "./local-access.js";

export async function connectXWithLocalCallback(): Promise<{
  xHandle: string;
  xUserId: string;
}> {
  const env = loadEnv();
  if (!env.TOKEN_VAULT_KEY) throw new Error("TOKEN_VAULT_KEY is required.");

  const access = await ensureLocalAccess();
  if (env.X_MODE === "mock") {
    const x = createXClient(env);
    const me = await x.getMe("mock-access-token");
    await prisma.xConnection.upsert({
      where: { sessionId: access.sessionId },
      create: {
        sessionId: access.sessionId,
        xUserId: me.id,
        xHandle: me.username,
        encryptedAccessToken: encryptToken("mock-access-token", env.TOKEN_VAULT_KEY),
        encryptedRefreshToken: encryptToken("mock-refresh-token", env.TOKEN_VAULT_KEY),
        scope: "mock",
        accessTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        tweetCount: me.tweetCount,
      },
      update: {
        xUserId: me.id,
        xHandle: me.username,
        encryptedAccessToken: encryptToken("mock-access-token", env.TOKEN_VAULT_KEY),
        encryptedRefreshToken: encryptToken("mock-refresh-token", env.TOKEN_VAULT_KEY),
        scope: "mock",
        accessTokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        tweetCount: me.tweetCount,
      },
    });
    return { xHandle: me.username, xUserId: me.id };
  }

  if (!env.X_CLIENT_ID) throw new Error("X_CLIENT_ID is required.");
  const { verifier, challenge } = createPkcePair();
  const state = createState();

  const callback = await waitForOAuthCallback();
  const redirectUri = `http://127.0.0.1:${callback.port}/callback`;
  const authUrl = buildAuthorizeUrl({
    clientId: env.X_CLIENT_ID,
    redirectUri,
    state,
    challenge,
  });

  openBrowser(authUrl);
  const params = await callback.result.finally(() => callback.close());
  if (!params.code || !params.state || !safeEqual(params.state, state)) {
    throw new Error("X OAuth callback state mismatch or missing code.");
  }

  const tokens = await exchangeCodeForTokens({
    code: params.code,
    verifier,
    clientId: env.X_CLIENT_ID,
    clientSecret: env.X_CLIENT_SECRET,
    redirectUri,
  });
  const x = createXClient(env);
  const me = await x.getMe(tokens.accessToken);

  await prisma.xConnection.upsert({
    where: { sessionId: access.sessionId },
    create: {
      sessionId: access.sessionId,
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

  return { xHandle: me.username, xUserId: me.id };
}

async function waitForOAuthCallback(): Promise<{
  port: number;
  result: Promise<{ code: string | null; state: string | null }>;
  close: () => Promise<void>;
}> {
  let resolveResult!: (value: { code: string | null; state: string | null }) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<{ code: string | null; state: string | null }>(
    (resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    },
  );

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    resolveResult({
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
    });
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Mirai X connection complete. You can close this tab.");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    rejectResult(new Error("Could not bind local callback server."));
    throw new Error("Could not bind local callback server.");
  }

  const timeout = setTimeout(() => {
    rejectResult(new Error("Timed out waiting for X OAuth callback."));
  }, 5 * 60 * 1000);

  return {
    port: address.port,
    result: result.finally(() => clearTimeout(timeout)),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}
