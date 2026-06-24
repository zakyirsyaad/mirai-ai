# AGENTS.md

Guidance for Codex when working in this repository.

## What this is

**mirai-ai** is an autonomous X (Twitter) content agent listed as a **Provider**
on the **CROO Network** (a decentralized AI-agent marketplace on Base L2). A
buyer hires the agent on CROO (USDC into on-chain escrow); the agent then runs a
multi-day posting campaign on the buyer's own X account and settles via
`deliverOrder()` when the access window closes. Built for the CROO Hackathon —
the repo is **public / open-source (MIT)**.

## Monorepo layout (pnpm + turborepo)

```
apps/
  agent/   CROO Provider worker + hosted MCP API + staged BullMQ pipeline
  mcp/     Single npm binary (`mirai`) + MCP stdio server for agent clients
packages/
  shared/  env loader, token vault (AES-256-GCM), Zod requirement/deliverable schemas, event types
  db/      Prisma schema + client singleton (Postgres)
  x/       X OAuth2 PKCE + write + owned reads; RealXClient + MockXClient (chosen by X_MODE)
  croo/    Wrapper over @croo-network/sdk; normalizes events, owns the WebSocket
  content/ Codex engine: voice extraction, X-signal grounding, write, rewrite, review, ideas (AnthropicLlm + MockLlm)
```

Dependency direction: `shared` ← everything; apps depend on packages, never the
reverse. Build bottom-up (turbo handles ordering).

## The pipeline (apps/agent)

Decomposed into discrete, independently-retryable, **idempotent** stages — one
BullMQ queue + worker each:

```
INTAKE → BRIEF → PLAN → [ACQUIRE → COMPOSE → REVIEW → POST → RECORD] ×N → DELIVER → COMPLETE
```

- **INTAKE / OrderPaid** (`src/croo.ts`): auto-accept negotiations; on payment,
  provision `AccessSession` + `Order` + `Campaign`, enqueue campaign `start`.
- **BRIEF+PLAN** (`src/stages/campaign.ts` → `start`): lay out scheduled post
  slots once X is connected + a voice profile exists; else park `WAITING_FOR_X`.
- **ACQUIRE** (`stages/acquire.ts`): AUTONOMOUS → owned-read signals (timeline +
  trends) → grounding; USER_SUPPLIED → claim next pool item. Persists rawMaterial.
- **COMPOSE** (`stages/compose.ts`): `write()`/`rewrite()` on-voice draft.
- **REVIEW** (`stages/review.ts`): deterministic safety/length/URL/dedupe gate.
  Fully autonomous — no human approval. Fail ⇒ SKIPPED.
- **POST** (`stages/post.ts`): publish to X. Idempotent (won't double-post if a
  tweetId already exists). Worker concurrency = 1.
- **RECORD** (`stages/record.ts`): fetch engagement metrics (owned read).
- **DELIVER** (`campaign.ts` → `deliver`): scheduler triggers when the window
  closes; assemble the report and call CROO `deliverOrder(..., Schema)`.

`src/scheduler.ts` polls every 30s: fans due PLANNED slots into ACQUIRE and
triggers DELIVER for expired campaigns. All enqueues use deterministic jobIds.

## CROO lifecycle (packages/croo)

`NEGOTIATION → LOCK → DELIVER → CLEAR`. Events: `NegotiationCreated`,
`OrderPaid`, `OrderCompleted`. The agent is the **single owner of the CROO
WebSocket — 1 WS per API key.** MCP clients never open their own CROO
connection; they call the hosted API, and the agent owns marketplace settlement.

Raw SDK field access is isolated to `packages/croo/src/client.ts` (the
normalizers). If the SDK's payload field names differ from what we guessed,
**that is the only file to adjust.**

## Identity model

**License-as-access, wallet-as-origin.** On `OrderPaid`, the agent keys each
session to the buyer wallet and issues a signed license. MCP clients use that
license to access hosted tools; no dashboard link or SIWE flow is required.

## Commands

```bash
pnpm install
cp .env.example .env          # then fill in (see Secrets below)
pnpm infra:up                 # Postgres + Redis via docker compose
pnpm db:migrate               # prisma migrate dev
pnpm db:generate              # regenerate client after schema changes
pnpm agent:dev                # run hosted API + CROO listener + workers + scheduler
pnpm typecheck                # turbo typecheck across the workspace
pnpm build                    # turbo build
```

## Mocks — develop with zero external cost

- `X_MODE=mock` (default) → `MockXClient`: full pipeline, no X API calls, no cost.
- No `ANTHROPIC_API_KEY` → `MockLlm`: deterministic content, no Anthropic calls.
- No `CROO_SDK_KEY` → agent runs the pipeline without marketplace intake.

Flip each to real by supplying its credential. This is the primary way to test
end-to-end offline.

## Secrets — CRITICAL

- All secrets live ONLY in `.env`, which **is gitignored**. Never commit it.
- **Never** write a real key into `.env.example`, README, code, or any tracked
  file — the repo is public; a leaked key is an auto-DQ for the hackathon.
- Access secrets exclusively via `process.env` (through `loadEnv()` in
  `@mirai/shared`). Relevant: `CROO_SDK_KEY`, `X_CLIENT_ID/SECRET`,
  `ANTHROPIC_API_KEY`, `TOKEN_VAULT_KEY`.
- X OAuth tokens are encrypted at rest (AES-256-GCM via `@mirai/shared` vault,
  keyed by `TOKEN_VAULT_KEY`). Generate that key with `openssl rand -hex 32`.

## Cost discipline (X API, 2026 pay-per-use)

- Posts with a URL cost ~13× a plain post — the writer is instructed to avoid
  URLs, and REVIEW rejects drafts containing them.
- Prefer **owned reads** (the hirer's own timeline/tweets/trends, ~$0.001 each)
  and cache them 24h (`packages/x/src/ratelimit.ts`) to match X's dedupe window.
- `personalized_trends` may be unavailable on pay-per-use; `RealXClient`
  degrades gracefully and ACQUIRE falls back to niche + own-tweet grounding.

## Conventions

- TypeScript strict, ESM (`"type": "module"`), NodeNext in packages/agent.
- Workspace imports use the `.js` extension in specifiers (NodeNext), e.g.
  `import { x } from "./y.js"` even though the source is `.ts`.
- Keep new external-facing surfaces narrow and mockable, like `XClient`/`Llm`.

## Hackathon submission checklist

- [x] Open source (MIT, public repo)
- [ ] Listed on CROO Agent Store (register agent in the dashboard)
- [ ] Integrated with CAP (CROO Agent Protocol) — via `@croo-network/sdk`
- [ ] Demo video + README (≤ 5 min)
- [ ] BUIDL filed on DoraHacks
- Anti-sybil: needs ≥5 unique buyer wallets, ≥3 counterparty agents, no
  concentrated self-trade; random 10% audit. Do NOT fake demos / self-trade.
