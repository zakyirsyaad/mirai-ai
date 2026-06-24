// Read-only CROO connectivity smoke test.
//
// Verifies that CROO_SDK_KEY + CROO_API_URL authenticate against the real CROO
// API, WITHOUT opening the provider WebSocket and WITHOUT creating, accepting,
// or rejecting any order. Two read-only HTTP calls only (listNegotiations /
// listOrders). Safe to run repeatedly; never prints the raw SDK key.
//
//   node apps/agent/scripts/croo-smoke.mjs
//
// Resolves the SDK from packages/croo/node_modules so it works regardless of
// pnpm hoisting. Reads .env directly (no dotenv dependency).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ── load .env (root) into process.env without a dependency ──
function loadDotenv(path) {
  let txt;
  try {
    txt = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const root = resolve(process.cwd());
loadDotenv(resolve(root, ".env"));

const sdkKey = process.env.CROO_SDK_KEY ?? "";
const baseURL = process.env.CROO_API_URL ?? "https://api.croo.network";
const wsURL = process.env.CROO_WS_URL ?? "wss://api.croo.network/ws";

const mask = (k) => (k ? `${k.slice(0, 8)}...${k.slice(-4)} (len ${k.length})` : "UNSET");

console.log("── CROO read-only smoke test ──");
console.log("baseURL:", baseURL);
console.log("wsURL:  ", wsURL);
console.log("SDK key:", mask(sdkKey));

if (!sdkKey) {
  console.error("\nCROO_SDK_KEY is empty — nothing to test.");
  process.exit(1);
}

// ── import the installed SDK by explicit path ──
const sdkEntry = resolve(
  root,
  "packages/croo/node_modules/@croo-network/sdk/dist/index.js",
);
const { AgentClient, APIError } = await import(pathToFileURL(sdkEntry).href);

const client = new AgentClient({ baseURL, wsURL }, sdkKey);

function reportError(label, err) {
  if (err instanceof APIError) {
    console.error(
      `✗ ${label} failed — APIError code=${err.code} reason=${err.reason} message=${err.message}`,
    );
  } else {
    console.error(`✗ ${label} failed —`, err?.message ?? err);
  }
}

let ok = true;

// 1) Provider negotiations (read-only)
try {
  const negs = await client.listNegotiations({
    role: "provider",
    page: 1,
    pageSize: 10,
  });
  const n = Array.isArray(negs) ? negs.length : 0;
  console.log(`✓ listNegotiations(provider) → ${n} negotiation(s)`);
  if (n > 0) {
    for (const neg of negs.slice(0, 5)) {
      console.log(
        `    · ${neg.negotiationId}  service=${neg.serviceId}  status=${neg.status}`,
      );
    }
  }
} catch (err) {
  ok = false;
  reportError("listNegotiations", err);
}

// 2) Provider orders (read-only)
try {
  const orders = await client.listOrders({
    role: "provider",
    page: 1,
    pageSize: 10,
  });
  const n = Array.isArray(orders) ? orders.length : 0;
  console.log(`✓ listOrders(provider) → ${n} order(s)`);
  if (n > 0) {
    for (const o of orders.slice(0, 5)) {
      console.log(
        `    · ${o.orderId}  status=${o.status}  sla=${o.slaDeadline}  wallet=${o.requesterWalletAddress}`,
      );
    }
  }
} catch (err) {
  ok = false;
  reportError("listOrders", err);
}

console.log(
  ok
    ? "\n✓ AUTH OK — SDK key + base URL are valid against the real CROO API."
    : "\n✗ One or more calls failed — see errors above.",
);
process.exit(ok ? 0 : 1);
