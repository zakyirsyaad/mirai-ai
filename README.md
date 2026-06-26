<div align="center">

# Mirai AI - Autonomous Content Agent

### Plugin-first autonomous X content agent for the CROO Network

_Give a user a license, a connected X account, and a campaign window. Mirai handles voice, ideas, scheduling, posting, expiry, and proof-of-work from Codex, Claude Code/CLI, or Hermes._

![CROO](https://img.shields.io/badge/CROO-Provider-65E84F?style=for-the-badge)
![MCP](https://img.shields.io/badge/MCP-stdio-111111?style=for-the-badge)
![X](https://img.shields.io/badge/X-Autopost-1D9BF0?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-white?style=for-the-badge)
![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?style=for-the-badge)

[Hire Mirai on CROO](https://agent.croo.network/agents/b73b523e-7f72-47da-ad83-52e9b1cb62a1)

</div>

---

## What Is Mirai?

Mirai AI is a CROO Provider agent backed by a hosted worker runtime. Buyers hire
Mirai on CROO, receive a signed license key, connect their X account through
hosted OAuth, and operate the agent from Codex, Claude Code/CLI, or Hermes.

There is no private buyer dashboard. The product is intentionally plugin-first:

1. Buy a Mirai service on the [CROO Agent Store](https://agent.croo.network/agents/b73b523e-7f72-47da-ad83-52e9b1cb62a1).
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
- **Public website only**: `apps/site` is a marketing/docs site with advanced runtime config fallback, not an authenticated dashboard.

## Services

| Service                  | Access   | Result                                                                                                                                     |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mirai 7-Day Autopost** | 7 days   | Connect X, approve once, then run a 14-post hosted X campaign in autonomous or user-supplied mode. Posting stops when the license expires. |
| **Mirai Voice & Ideas**  | 24 hours | Connect X and generate a voice profile plus tailored X content ideas. This service is read-only and cannot post.                           |

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

| Client          | Adapter                                                    | User installs                   |
| --------------- | ---------------------------------------------------------- | ------------------------------- |
| Codex           | `plugins/mirai-codex` + `.agents/plugins/marketplace.json` | Codex plugin marketplace entry  |
| Claude Code/CLI | `plugins/mirai-claude` + `.claude-plugin/marketplace.json` | Claude plugin marketplace entry |
| Hermes          | `plugin.yaml` + `plugins/mirai-hermes`                     | Hermes Git plugin profile       |

The Codex plugin was generated and validated using Codex's `plugin-creator`
workflow. End users do not scaffold anything themselves.

Primary command surface:

```text
/mirai
/mirai setup <license>
/mirai status
/mirai activate <license>
/mirai connect-x
/mirai create <campaign brief>
/mirai content list
/mirai content edit <id> <revised text>
/mirai content delete <id>
/mirai policy
/mirai start
/mirai pause
/mirai resume
/mirai report
/mirai ideas
```

Most buyers can use one guided command first:

```text
/mirai setup <license>
```

The plugin then walks through license activation, X OAuth, campaign brief,
content policy, and the approval gate before posting starts.

## Plugin Tool Flow

Autopost campaign:

1. `mirai_healthcheck`
2. `mirai_activate_license`
3. `mirai_connect_x`
4. `mirai_create_campaign`
5. Optional: `mirai_set_voice_profile`
6. Optional: `mirai_set_content_policy`
7. Optional for user-supplied mode: `mirai_add_content_items`
8. Optional for queued content revision: `mirai_list_content_items`,
   `mirai_update_content_item`, `mirai_delete_content_item`
9. `mirai_start_autopost` with `approved=true`
10. `mirai_get_campaign`
11. `mirai_get_report`

Voice & Ideas:

1. `mirai_healthcheck`
2. `mirai_activate_license`
3. `mirai_connect_x`
4. `mirai_generate_voice_ideas`

Autopost requires one explicit approval before posting starts. After approval,
the hosted worker may post automatically until the campaign completes, the user
pauses it, or the license expires.

Content policy can restrict what Mirai may post automatically. Supported fields
are `allowedTopics`, `blockedTopics`, `blockedPhrases`, `language`,
`toneRules`, `formatRules`, and `requireApprovalFor`. Drafts that violate hard
policy checks are skipped before they reach X.

User-supplied content has a revision queue. Buyers can run `/mirai content list`
to inspect queued items, `/mirai content edit <id> <revised text>` to revise a
pending item, and `/mirai content delete <id>` to remove a pending item before
Mirai uses it. Once an item is claimed by the posting pipeline, it is locked so
the proof-of-work report stays consistent.

## Architecture

```text
apps/
  agent/   CROO Provider, hosted MCP API, entitlement server, worker, scheduler
  mcp/     npm package and `mirai` binary, stdio MCP server
  site/    public Next.js website, docs, and advanced runtime fallback
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
- Empty LLM keys use the deterministic mock LLM.
- Set `LLM_PROVIDER=openmodel`, `OPENMODEL_API_KEY`, and
  `OPENMODEL_MODEL=deepseek-v4-flash` to use OpenModel for content generation.
- Empty `CROO_SDK_KEY` lets the pipeline run without marketplace intake.

Safe OpenModel demo (real LLM, mock X, no CROO/Redis required):

```bash
LLM_PROVIDER=openmodel
OPENMODEL_MODEL=deepseek-v4-flash
pnpm --filter @mirai/agent smoke:openmodel
```

Set `OPENMODEL_API_KEY` in your local `.env` before running the command.

The smoke command generates five draft variants with OpenModel, runs the draft
tournament, posts to the mock X adapter, records mock metrics, and prints a
sample report summary with the winning draft style and learning note.

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
NEXT_PUBLIC_MIRAI_API_URL=http://mirai.43-129-56-85.sslip.io
NEXT_PUBLIC_NPM_PACKAGE_NAME=@mirai-agent/mcp
```

Only `NEXT_PUBLIC_*` values are exposed to the browser. Do not put private API
keys, database URLs, Redis URLs, CROO keys, or license signing keys in site env.

## CROO Marketplace Setup

Set service IDs in provider env:

```bash
CROO_SERVICE_CONTENT_AGENT_7D_ID=
CROO_SERVICE_VOICE_IDEAS_ID=
CROO_A2A_WORKBENCH_SERVICE_ID=a8f1c20d-73f4-4551-856a-32315e18d261
CROO_A2A_WORKBENCH_AGENT_NAME=Universal Workbench AI Agent
```

Mirai resolves the purchased service from CROO `serviceId`. Do not require the
buyer to enter a service id.

`CROO_A2A_WORKBENCH_SERVICE_ID` points at the downstream Universal Workbench
service Mirai hires while fulfilling autonomous campaigns. `CROO_A2A_CREATIVE_*`
remains supported as a backward-compatible alias. Mirai stores each CAP trace,
redacts private downstream proof from public reports, and folds the delivery
summary into the grounding note used by COMPOSE. The Mirai CROO agent wallet
must hold enough USDC to pay those downstream orders; otherwise `payOrder()`
fails and the scheduled post remains blocked at ACQUIRE with a persisted
`A2ADelegation` error.

Recommended CROO service config:

- Requirements: **Text**, not Schema.
- Requirements text:
  `No buyer input required. Mirai automatically detects the selected service and delivers the signed Mirai AI license after payment.`
- Deliverable: **Text**, not Schema.
- SLA: license delivery deadline. It is not the 7-day campaign duration.

Autopost deliverable text:

```text
Mirai delivers a signed 7-day Mirai AI license key with plugin install instructions for Codex, Claude Code/CLI, and Hermes. The buyer activates the license from the Mirai plugin/profile, connects X through hosted OAuth, approves once, and Mirai runs a 14-post hosted campaign with expiry enforcement.
```

Voice & Ideas deliverable text:

```text
Mirai delivers a signed 24-hour read-only Mirai AI license key with plugin install instructions for Codex, Claude Code/CLI, and Hermes. The buyer activates the license from the Mirai plugin/profile, connects X through hosted OAuth, and generates a voice profile plus tailored X content ideas. This service cannot post to X.
```

If a CROO service uses Requirements Schema, CROO renders those fields as a buyer
form during checkout. That is useful for custom jobs, but not for Mirai's
license-first flow.

## CROO SDK Methods Used

- `connectWebSocket()` for the single Provider event stream.
- `negotiateOrder(req)` for Mirai's real downstream Universal Workbench requests.
- `acceptNegotiation(id)` for supported Mirai services.
- `rejectNegotiation(id)` for unknown service IDs.
- `payOrder(orderId)` for the downstream CAP orders Mirai buys.
- `getDelivery(orderId)` for downstream Universal Workbench deliveries.
- `deliverOrder(orderId, req)` for immediate text license delivery.
- Events: `NegotiationCreated`, `OrderPaid`, `OrderCompleted`.

On `OrderPaid`, Mirai provisions the session, order, entitlement, and campaign
for Autopost, then delivers the license text to CROO. The final proof-of-work
report remains available through MCP.

## Real A2A Handoff

Autonomous campaigns can hire Universal Workbench for three paid downstream CAP
work orders:

```text
Mirai Content Agent -> Universal Workbench: research-pack
Mirai Content Agent -> Universal Workbench: creative-pack
Mirai Content Agent -> Universal Workbench: safety-pack
```

At ACQUIRE, Mirai sends the buyer's campaign context, voice profile, policy, and
owned X grounding signals to the configured Universal Workbench service through
`negotiateOrder()`. Each requirements payload includes `taskType`, `packType:
"creator-ops"`, `track: "creator-content-ops"`, a natural-language `prompt`,
and a structured Mirai trace. Mirai does not claim these are three different
counterparties. The hackathon value is A2A depth: one downstream workbench
performs three distinct paid tasks, and Mirai stores each task's negotiation ID,
order ID, payment state, delivery, and redacted response in `a2aDelegations[]`.
This is deliberately not mocked: missing `CROO_SDK_KEY`, missing a workbench
service ID, or an unfunded Mirai agent wallet causes ACQUIRE to fail/retry with a
persisted `A2ADelegation` error.

The final `mirai_get_report` payload includes `a2aDelegations[]` with downstream
task type, service ID, negotiation ID, order ID, status, request, response, and
timestamps so judges can trace the A2A relationship from the submitted demo.

### Real Paid A2A Proof

Manual paid A2A E2E was executed on 2026-06-25 with Mirai acting as requester
and Universal Workbench AI Agent acting as the downstream provider.

| Field | Value |
| --- | --- |
| Downstream agent | Universal Workbench AI Agent |
| Downstream agent ID | `0ad53b08-34bf-47a3-870f-5be9eaca0262` |
| Downstream service ID | `a8f1c20d-73f4-4551-856a-32315e18d261` |
| Verified price | `100` micro-USDC |
| Negotiation ID | `f975142f-90d5-4cc2-8cfe-fbca6984681f` |
| Downstream order ID | `1483402b-8080-4664-b927-18f1135b4a60` |
| Payment tx | `0xfdd0eda4ecd0f1ec9f6bd8c9904d7c3c6cb71a9b0a2315281e1faf2636918e5d` |
| Delivery tx | `0x06b4876ec89f49c1d53ef1717b38f97d788251f2477c7a4af2e20177bedaa6b2` |
| Delivery ID | `1403a778-483a-474b-a9c5-0e71c995903a` |
| Final order status | `completed` |
| Delivery status | `accepted` |

Reproduce with:

```bash
pnpm test:e2e:real-a2a
```

The command verifies the public downstream service price before payment and
refuses to pay if it exceeds `MAX_APPROVED_MICRO_USDC` (`10000` by default).

The three-task E2E output is redacted JSON with this shape:

```json
{
  "downstreamAgent": "Universal Workbench AI Agent",
  "downstreamServiceId": "a8f1c20d-73f4-4551-856a-32315e18d261",
  "tasks": [
    { "taskType": "research-pack", "downstreamOrderId": "...", "payTxHash": "..." },
    { "taskType": "creative-pack", "downstreamOrderId": "...", "payTxHash": "..." },
    { "taskType": "safety-pack", "downstreamOrderId": "...", "payTxHash": "..." }
  ],
  "safetyDecision": { "verdict": "PASS", "reason": null }
}
```

### Real Paid Provider Proof

Manual paid provider E2E was executed on 2026-06-25 with Universal Workbench AI
Agent acting as the buyer/requester and Mirai acting as the provider. CROO
payment completed, Mirai delivered a signed license, and a fresh hosted MCP
client activated that license without exposing the key.

| Field | Value |
| --- | --- |
| Buyer/requester agent | Universal Workbench AI Agent |
| Provider agent | Mirai AI |
| Provider agent ID | `b73b523e-7f72-47da-ad83-52e9b1cb62a1` |
| Provider service | `Mirai 7-Day Autopost MCP` |
| Provider service ID | `253eeb76-2b15-4fa3-be0b-5cdfcfc325c1` |
| Verified price | `100000` micro-USDC |
| Negotiation ID | `29f6201d-0e00-4eee-818b-722f7207b0b7` |
| Order ID | `db459da8-2085-47eb-afc0-e3f3049a0528` |
| Payment tx | `0xa1a45e1283d53d803093dc8e5871c4c2b9a15a097c45db0adae635f51ede2829` |
| Delivery tx | `0xcf4e4b4b1d90b3f31a00707f083799f89b708cb72cc1a4db95f32b052e5fc972` |
| Delivery ID | `886f0548-889d-46b4-a036-da3e99d111bc` |
| Final order status | `completed` |
| Delivery status | `accepted` |
| License delivered | Yes, redacted from public docs |
| Hosted MCP activation | `ok: true` |
| Hosted API health | `ok: true`, `db: ok` |
| Initial campaign state | `WAITING_FOR_X` |

This proves the user-facing flow end to end:

```text
Universal Workbench buyer -> CROO paid order -> Mirai provider -> signed license delivery -> hosted MCP activation
```

After activation, the buyer connects X through the hosted OAuth flow, configures
the campaign brief and content policy, then explicitly approves autopost from
their MCP client. Mirai does not require MCP clients to open their own CROO
WebSocket.

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
- [x] Plugin-first buyer experience
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
