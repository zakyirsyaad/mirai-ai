import { createHash, randomBytes } from "node:crypto";
import type { XTokens } from "./types.js";

/**
 * OAuth 2.0 Authorization Code flow with PKCE for X.
 *
 * X requires PKCE for public clients. We generate a code verifier/challenge,
 * send the user to the authorize URL, then exchange the returned code for
 * tokens. `state` is used as CSRF protection and to correlate the callback
 * with the originating buyer/session record.
 */

const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

/** Scopes: read timeline/tweets, write tweets, offline for refresh tokens. */
export const X_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** Generate a PKCE verifier + S256 challenge. */
export function createPkcePair(): PkcePair {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

/** Random opaque state for CSRF protection. */
export function createState(): string {
  return base64url(randomBytes(16));
}

export interface AuthorizeUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}

/** Build the URL to redirect the user to for consent. */
export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  scope: string;
}

function basicAuthHeader(clientId: string, clientSecret?: string): string {
  // Confidential clients send HTTP Basic; public clients omit it.
  const creds = clientSecret ? `${clientId}:${clientSecret}` : clientId;
  return `Basic ${Buffer.from(creds).toString("base64")}`;
}

export interface ExchangeParams {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForTokens(
  p: ExchangeParams,
): Promise<XTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
    client_id: p.clientId,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(p.clientId, p.clientSecret),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `X token exchange failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export interface RefreshParams {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}

/** Refresh an expired access token using the stored refresh token. */
export async function refreshTokens(p: RefreshParams): Promise<XTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: p.clientId,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(p.clientId, p.clientSecret),
    },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `X token refresh failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as TokenResponse;
  return {
    accessToken: json.access_token,
    // X rotates refresh tokens; fall back to the old one if absent.
    refreshToken: json.refresh_token ?? p.refreshToken,
    scope: json.scope,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}
