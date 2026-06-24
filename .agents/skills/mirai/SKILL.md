---
name: mirai
description: Operate Mirai MCP, a CROO-licensed local X content agent. Use when the user wants to activate a Mirai license, connect X, create or start a 7-day autopost campaign, manage user-supplied content, pause or resume posting, inspect campaign status, generate reports, use the read-only Voice & Ideas service, or troubleshoot Mirai MCP/worker/database/license state from Codex, Claude Code/CLI, Hermes, or another MCP-capable client.
---

# Mirai

## Overview

Use Mirai through MCP tools. Treat the MCP tools as the source of truth for campaign state, license validity, X connection, posting, and reports. Do not bypass Mirai by writing directly to X or editing database rows unless the user explicitly asks for maintenance/debugging.

## Tool Order

For guided first-run setup:

1. Call `mirai_activate_license` if a license is provided or ask for it if missing.
2. Call `mirai_healthcheck`.
3. Call `mirai_connect_x` and wait for the OAuth callback when needed.
4. Collect campaign brief: niche, audience, goal, content mode, and tone.
5. Call `mirai_create_campaign`.
6. Collect and call `mirai_set_content_policy`.
7. If user-supplied mode is selected, collect content items and call `mirai_add_content_items`.
8. Call `mirai_get_campaign`, summarize the setup, then ask for explicit approval before calling `mirai_start_autopost`.

For a normal 7-day autopost campaign:

1. Call `mirai_healthcheck`.
2. If not activated, call `mirai_activate_license` with the user's license key.
3. Call `mirai_connect_x`.
4. Call `mirai_create_campaign` with the requested mode and campaign brief.
5. Call `mirai_set_voice_profile` if the user provides explicit voice details or wants manual voice control.
6. Call `mirai_set_content_policy` if the user provides allowed topics, blocked topics, blocked phrases, language, tone, format, or approval-only subjects.
7. Call `mirai_add_content_items` only for user-supplied mode.
8. Before posting, summarize account, mode, expiry, 14-post limit, and active content policy, then call `mirai_start_autopost` with `approved=true` only after the user clearly approves.
9. Use `mirai_get_campaign` for status and `mirai_get_report` for proof-of-work.

For Voice & Ideas:

1. Call `mirai_healthcheck`.
2. Activate the license if needed.
3. Call `mirai_connect_x`.
4. Call `mirai_generate_voice_ideas`.

## Safety Rules

- Ask for explicit user approval before calling `mirai_start_autopost` with `approved=true`.
- Before starting autopost, ask for or confirm content filters: allowed topics, blocked topics, blocked phrases, language, tone rules, format rules, and approval-only subjects.
- Never request or expose raw X access tokens, refresh tokens, private license keys, or `.env` secrets.
- If a license is expired, revoked, missing a scope, or remote entitlement check fails, explain the status and do not attempt posting.
- If `mirai_connect_x` opens OAuth, let the browser/local callback flow complete; do not ask the user to paste X tokens.
- Use `mirai_pause_autopost` for "stop for now" and `mirai_get_report` for "what happened".
- Prefer `mirai_get_campaign` before changing state so the response reflects the current campaign.

## Common Requests

- "Status", "how is Mirai doing", "campaign progress": call `mirai_get_campaign`.
- "Setup", "guide me", "mulai dari awal", "tuntun aku": follow the guided first-run setup.
- "Start posting", "run campaign", "approve autopost": call `mirai_get_campaign`, summarize the consequences, then call `mirai_start_autopost` only with explicit approval.
- "Pause/stop": call `mirai_pause_autopost`.
- "Continue/resume": call `mirai_resume_autopost`.
- "Report", "proof", "tweet URLs", "metrics": call `mirai_get_report`.
- "Use my notes/content": call `mirai_add_content_items`, then confirm user-supplied mode in campaign status.
- "Only post about...", "don't post about...", "filter posts", "content policy": call `mirai_set_content_policy`.
- "Voice ideas only": call `mirai_generate_voice_ideas`; do not call posting tools.

## Runtime

Prefer hosted mode for normal users. Hosted mode is the default, and users do not run `mirai worker`; the VPS worker runs campaigns.

```bash
mirai doctor
mirai config json
```

Use `mirai init --hosted --api-url https://api.mirai.example --force` only when overriding the packaged hosted API. Use local/self-hosted mode only for development or advanced self-hosting:

```bash
mirai init
mirai infra up
mirai worker
```

Register the MCP server with clients using:

```json
{
  "mcpServers": {
    "mirai": {
      "command": "mirai",
      "args": ["mcp"]
    }
  }
}
```
