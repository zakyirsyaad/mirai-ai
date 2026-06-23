# mirai-ai

> Autonomous X (Twitter) content agent on the **CROO Network**. Hire it once; it generates
> and posts content in *your* voice on a recurring schedule, then delivers a proof-of-work
> report on-chain.

mirai-ai is a **Provider agent** on [CROO Network](https://croo.network) (a decentralized
AI-agent marketplace on Base L2). A buyer hires the agent through CROO (paying USDC into
on-chain escrow); the agent then runs a multi-day content campaign on the buyer's own X
account and settles via `deliverOrder()` when the window closes.

## What it does

- **Connect your X account** (OAuth 2.0 PKCE) — the agent acts on your behalf.
- **Learns your voice** from your recent tweets (or an onboarding questionnaire if your
  account is new/empty).
- **Two content modes**, switchable any time:
  - **Autonomous** — sources material from *your* X signals (home timeline + personalized
    trends, billed as cheap "owned reads") and writes on-theme posts.
  - **User-supplied** — you paste raw content; the agent rewrites and repackages it for X.
- **Posts automatically** on a schedule, fully autonomous (automated safety/length/dedupe
  review, no manual approval needed).
- **Live dashboard** — tune voice, manage the content pool, flip mode, pause/resume, and
  watch each post move through the pipeline in real time.

## Services on the CROO Agent Store

| # | Service | What you get |
|---|---------|--------------|
| 1 | **7-Day AI Content Agent** (flagship) | A 7-day access pass: connect X, configure voice/mode, recurring auto-posting, end-of-window report with all tweet URLs + metrics. |
| 2 | **Voice Profile & Content Ideas** (read-only) | Connect X → agent reads your timeline → delivers a voice profile + 10 tailored content ideas. No posting. |

## Architecture

A pnpm + turborepo monorepo:

```
apps/
  agent/   CROO Provider worker + staged BullMQ scheduler (the core service)
  web/     Companion dashboard (connect X, voice, content pool, mode, live progress)
packages/
  croo/    Wrapper over @croo-network/sdk (listener + lifecycle helpers)
  x/       X OAuth2 PKCE + write + owned reads; real + mock adapters
  content/ Claude engine: voice extraction, X-signal grounding, write, rewrite
  db/      Prisma schema + client (Postgres)
  shared/  Order/requirement types, token vault, env loader, event bus
```

The agent is decomposed into a **10-stage pipeline**, one BullMQ queue per stage — each
independently retryable and idempotent:

```
INTAKE → BRIEF → PLAN → [ACQUIRE → COMPOSE → REVIEW → POST → RECORD] ×N → DELIVER → COMPLETE
```

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure — copy the template and fill in your keys
cp .env.example .env
#   (.env is gitignored — never commit it)

# 3. Start infra (Postgres + Redis)
pnpm infra:up

# 4. Set up the database
pnpm db:migrate

# 5. Run the agent + dashboard
pnpm agent:dev      # CROO listener + pipeline workers
pnpm web:dev        # dashboard at http://localhost:3000
```

X posting defaults to a **mock adapter** (`X_MODE=mock`) so you can develop end-to-end with
zero API cost. Set `X_MODE=real` with X app credentials to post for real.

## CROO SDK methods used

> _Filled in as the integration lands — see `packages/croo`._

- `connectWebSocket()` — single persistent Provider connection.
- `acceptNegotiation(id)` / `rejectNegotiation(id)` — INTAKE stage.
- `deliverOrder(orderId, req)` — DELIVER stage (`DeliverableType.Schema`).
- Event subscriptions: `NegotiationCreated`, `OrderPaid`, `OrderCompleted`.

## License

[MIT](./LICENSE)
