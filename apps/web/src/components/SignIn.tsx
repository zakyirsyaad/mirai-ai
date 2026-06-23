"use client";

import { useState } from "react";

/**
 * Wallet sign-in via SIWE. Requests a nonce, asks the injected wallet to sign a
 * SIWE message, posts it for verification, then redirects to the dashboard.
 *
 * Kept dependency-light: builds the SIWE message string by hand and uses the
 * EIP-1193 provider directly so no wallet-connector bundle is required.
 */
declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}

export function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setBusy(true);
    try {
      if (!window.ethereum)
        throw new Error("No wallet found. Install MetaMask or similar.");

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No account selected.");

      const nonce = await (await fetch("/api/auth/nonce")).text();

      const domain = window.location.host;
      const origin = window.location.origin;
      const issuedAt = new Date().toISOString();
      const statement = "Sign in to your mirai-ai dashboard.";
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        statement,
        "",
        `URI: ${origin}`,
        "Version: 1",
        "Chain ID: 8453",
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt}`,
      ].join("\n");

      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Sign-in failed.");
      }
      window.location.href = "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={handleSignIn} disabled={busy}>
        {busy ? "Signing in…" : "Sign in with wallet"}
      </button>
      {error && (
        <p className="muted" style={{ color: "var(--err)", marginTop: 10 }}>
          {error}
        </p>
      )}
    </div>
  );
}
