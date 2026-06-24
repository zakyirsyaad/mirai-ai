<div align="center">

# Mirai AI - Autonomous Content Agent

### Plugin-first autonomous X content agent for the CROO Network

_Give a user a license, a connected X account, and a campaign window. Mirai handles voice, ideas, scheduling, posting, expiry, and proof-of-work from Codex, Claude Code/CLI, or Hermes._

![CROO](https://img.shields.io/badge/CROO-Provider-65E84F?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-stdio-111111?style=for-the-badge)
![X](https://img.shields.io/badge/X-Autopost-1D9BF0?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?style=for-the-badge)

</div>

---

## What Is Mirai?

Mirai AI is a CROO Provider agent backed by a hosted worker runtime. Buyers hire
Mirai on CROO, receive a signed license key, connect their X account through
hosted OAuth, and operate the agent from Codex, Claude Code/CLI, or Hermes.

There is no private buyer dashboard. The product is intentionally plugin-first:

1. Buy a Mirai service on CROO.
2. Copy the delivered `mirai_v1.<payload>.<signature>` license key.
3. Install the Mirai plugin/profile for your client.
4. Activate the license, connect X, and run Mirai from slash commands or natural language.

MCP is still the engine underneath the plugin. Users normally do not install or
configure MCP manually; the plugin starts `@mirai-agent/mcp` through `npx`.

## Product Shape

- **Plugin-first**: users install a Mirai plugin/profile; MCP runs behind the scenes.
- **MCP-compatible**: every plugin uses the same stdio MCP runtime and hosted API.
- **Hosted by default**: users do not run Docker, Postgres, Redis, or workers.
- **CROO-first purchase flow**: CROO handles hiring, payment, and marketplace settlement.
- **License-as-access**: sensitive actions verify signature, expiry, scope, and hosted entitlement.
- **Local client, hosted execution**: users interact locally while scheduling, X tokens, posting, and reports live on the hosted runtime.
- **Public website only**: `apps/site` is a marketing/docs site with an MCP config generator, not an authenticated dashboard.

## Services

| Service | Access | Result |
| --- | --- | --- |
| **Mirai 7-Day Autopost MCP** | 7 days | Connect X, approve once, then run a 14-post hosted X campaign in autonomous or user-supplied mode. Posting stops when the license expires. |
| **Mirai Voice & Ideas MCP** | 24 hours | Connect X and generate a voice profile plus tailored X content ideas. This service is read-only and cannot post. |

Service limits are encoded inside the signed license payload. Autopost licenses
include posting scopes and a 14-post limit. Voice & Ideas licenses include only
read/report/ideas scopes.

## Buyer Quickstart

Codex:

```bash
codex plugin marketplace add zakyirsyaad/mirai-ai --ref main --sparse .agents --sparse plugins/mirai-codex
codex plugin add mirai-codex@mirai-ai
```

Claude Code/CLI:

```bash
claude plugin marketplace add zakyirsyaad/mirai-ai --sparse .claude-plugin plugins/mirai-claude
claude plugin install mirai-claude@mirai-ai
```

Hermes:

```bash
hermes plugins install zakyirsyaad/mirai-ai --enable
hermes mcp add mirai --command npx --env MIRAI_API_URL=http://mirai.43-129-56-85.sslip.io --args -y @mirai-agent/mcp@latest mcp
```

After installing a plugin/profile, restart the client and run Mirai:

```text
/mirai status
/mirai activate <license>
/mirai connect-x
/mirai ideas
```

Advanced fallback: users can still install `@mirai-agent/mcp` directly and add
it as an MCP server manually, but this is not the primary buyer flow.

## Plugin Adapters

The MCP package is the hidden engine. Each client gets a plugin/profile adapter
that starts the same Mirai runtime through `npx`.

| Client | Adapter | User installs |
| --- | --- | --- |
| Codex | `plugins/mirai-codex` + `.agents/plugins/marketplace.json` | Codex plugin marketplace entry |
| Claude Code/CLI | `plugins/mirai-claude` + `.claude-plugin/marketplace.json` | Claude plugin marketplace entry |
| Hermes | `plugin.yaml` + `plugins/mirai-hermes` | Hermes Git plugin profile |

The Codex plugin was generated and validated using Codex's `plugin-creator`
workflow. End users do not scaffold anything themselves.

Primary command surface:

```text
/mirai
/mirai status
/mirai activate <license>
/mirai connect-x
/mirai create <campaign brief>
/mirai start
/mirai pause
/mirai resume
/mirai report
/mirai ideas
```

## MCP Tool Flow

Autopost campaign:

1. `mirai_healthcheck`
2. `mirai_activate_license`
3. `mirai_connect_x`
4. `mirai_create_campaign`
5. Optional: `mirai_set_voice_profile`
6. Optional for user-supplied mode: `mirai_add_content_items`
7. `mirai_start_autopost` with `approved=true`
8. `mirai_get_campaign`
9. `mirai_get_report`

Voice & Ideas:

1. `mirai_healthcheck`
2. `mirai_activate_license`
3. `mirai_connect_x`
4. `mirai_generate_voice_ideas`

Autopost requires one explicit approval before posting starts. After approval,
the hosted worker may post automatically until the campaign completes, the user
pauses it, or the license expires.

## Architecture

```text
apps/
  agent/   CROO Provider, hosted MCP API, entitlement server, worker, scheduler
  mcp/     npm package and `mirai` binary, stdio MCP server
  site/    public Next.js website and docs/config generator
packages/
  croo/    @croo-network/sdk wrapper and normalized lifecycle events
  x/       X OAuth2 PKCE, posting, owned reads, real/mock clients
  content/ voice extraction, grounding, writing, rewriting, review, ideas
  db/      Prisma schema and Postgres client
  shared/  env loader, license, requirements, token vault, shared types
```

Hosted campaign pipeline:

```text
INTAKE -> BRIEF -> PLAN -> [ACQUIRE -> COMPOSE -> REVIEW -> POST -> RECORD] xN -> DELIVER -> COMPLETE
```

Runtime boundaries:

- `apps/agent` is the only CROO WebSocket owner.
- MCP clients never connect directly to CROO.
- X OAuth tokens are encrypted and stored on the hosted runtime.
- The MCP package embeds only the license public key.
- The license private key stays provider-side only.

## Licensing

License format:

```text
mirai_v1.<base64url_payload>.<ed25519_signature>
```

Payload fields include:

- `orderId`
- `wallet`
- `service`
- `issuedAt`
- `expiresAt`
- `scopes`
- service limits such as `maxPosts`

`apps/agent` signs licenses with `MIRAI_LICENSE_PRIVATE_KEY`. The MCP package
verifies licenses with `MIRAI_LICENSE_PUBLIC_KEY`. Hosted actions also perform
online entitlement checks on activation, start, resume, post, deliver, and other
sensitive operations.

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm agent:dev
```

Default development mode uses mocks:

- `X_MODE=mock` avoids real X API calls.
- Empty `ANTHROPIC_API_KEY` uses the deterministic mock LLM.
- Empty `CROO_SDK_KEY` lets the pipeline run without marketplace intake.

Local MCP development:

```bash
pnpm --filter @mirai-agent/mcp build
node apps/mcp/dist/cli.js doctor
node apps/mcp/dist/cli.js config local
node apps/mcp/dist/cli.js mcp
```

Self-hosted/local worker mode is available for advanced development:

```bash
mirai init
mirai infra up
mirai worker
```

`mirai init` creates `~/.mirai/.env` and `~/.mirai/docker-compose.yml` for local
Postgres and Redis.

## Public Website

`apps/site` is a local-only Next.js site for the public Mirai website and docs.
It uses shadcn/ui, Tailwind CSS, lucide-react, and Framer Motion.

```bash
pnpm site:dev
pnpm site:build
pnpm site:start
```

Site env examples:

```bash
NEXT_PUBLIC_CROO_MARKETPLACE_URL=
NEXT_PUBLIC_MIRAI_API_URL=https://api.mirai-agent.com
NEXT_PUBLIC_NPM_PACKAGE_NAME=@mirai-agent/mcp
```

Only `NEXT_PUBLIC_*` values are exposed to the browser. Do not put private API
keys, database URLs, Redis URLs, CROO keys, or license signing keys in site env.

## CROO Marketplace Setup

Set service IDs in provider env:

```bash
CROO_SERVICE_CONTENT_AGENT_7D_ID=
CROO_SERVICE_VOICE_IDEAS_ID=
```

Mirai resolves the purchased service from CROO `serviceId`. Do not require the
buyer to enter a service id.

Recommended CROO service config:

- Requirements: **Text**, not Schema.
- Requirements text:
  `No buyer input required. Mirai automatically detects the selected service and delivers the signed MCP license after payment.`
- Deliverable: **Text**, not Schema.
- SLA: license delivery deadline. It is not the 7-day campaign duration.

Autopost deliverable text:

```text
Mirai delivers a signed 7-day MCP license key with install instructions. The buyer activates the license in an MCP client, connects X through hosted OAuth, approves once, and Mirai runs a 14-post hosted campaign with expiry enforcement.
```

Voice & Ideas deliverable text:

```text
Mirai delivers a signed 24-hour read-only MCP license key with install instructions. The buyer activates the license in an MCP client, connects X through hosted OAuth, and generates a voice profile plus tailored X content ideas. This service cannot post to X.
```

If a CROO service uses Requirements Schema, CROO renders those fields as a buyer
form during checkout. That is useful for custom jobs, but not for Mirai's
license-first flow.

## CROO SDK Methods Used

- `connectWebSocket()` for the single Provider event stream.
- `acceptNegotiation(id)` for supported Mirai services.
- `rejectNegotiation(id)` for unknown service IDs.
- `deliverOrder(orderId, req)` for immediate text license delivery.
- Events: `NegotiationCreated`, `OrderPaid`, `OrderCompleted`.

On `OrderPaid`, Mirai provisions the session, order, entitlement, and campaign
for Autopost, then delivers the license text to CROO. The final proof-of-work
report remains available through MCP.

## Production Notes

Mirai uses Prisma with Postgres and BullMQ with Redis.

For Supabase Postgres:

- Use `.env.production.example` as the VPS template.
- Prefer the Supavisor session pooler on port `5432` for IPv4-only VPS hosts.
- Add `sslmode=require` to the connection string.
- Keep the real connection string only in `.env`, `.env.production`, or a secret manager.
- Rotate any credential that was pasted into chat, logs, screenshots, or tickets.

Production migration commands:

```bash
pnpm db:migrate:deploy
pnpm db:generate
```

For real X OAuth, configure the X app callback to:

```text
<MIRAI_API_URL>/oauth/x/callback
```

## Scripts

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm db:migrate
pnpm db:migrate:deploy
pnpm agent:dev
pnpm site:dev
pnpm site:build
```

## Security Rules

- Never commit `.env`, `.env.production`, database URLs, Redis URLs, CROO keys,
  X OAuth secrets, Anthropic keys, or license signing keys.
- Do not expose private env vars through `NEXT_PUBLIC_*`.
- Never deliver raw X access or refresh tokens through CROO.
- Treat CROO payloads, MCP inputs, and OAuth callbacks as untrusted external input.
- Keep posting idempotent; never double-post if a slot already has a tweet ID.

## Hackathon Checklist

- [x] Open source (MIT)
- [x] MCP-first buyer experience
- [x] CROO Provider integration with SDK lifecycle
- [x] Signed license delivery
- [x] Hosted worker mode
- [x] Public website and docs scaffold
- [ ] Final CROO Agent Store listing polish
- [ ] Real-domain HTTPS deployment
- [ ] Real X OAuth production callback
- [ ] Demo video
- [ ] DoraHacks submission

## License

[MIT](./LICENSE)
