import { cookies } from "next/headers";

/**
 * Transient storage for the X OAuth PKCE verifier + state, scoped to the
 * browser via httpOnly cookies for the short window between redirecting the
 * user to X and handling the callback.
 */
const PKCE_COOKIE = "mirai_x_pkce";
const STATE_COOKIE = "mirai_x_state";

export async function stashOAuth(verifier: string, state: string): Promise<void> {
  const jar = await cookies();
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  };
  jar.set(PKCE_COOKIE, verifier, opts);
  jar.set(STATE_COOKIE, state, opts);
}

export async function readOAuth(): Promise<{
  verifier: string | null;
  state: string | null;
}> {
  const jar = await cookies();
  return {
    verifier: jar.get(PKCE_COOKIE)?.value ?? null,
    state: jar.get(STATE_COOKIE)?.value ?? null,
  };
}

export async function clearOAuth(): Promise<void> {
  const jar = await cookies();
  jar.delete(PKCE_COOKIE);
  jar.delete(STATE_COOKIE);
}
