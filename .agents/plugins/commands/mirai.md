---
description: Control Mirai AI campaigns through the Mirai MCP server.
argument-hint: "status | activate <license> | connect-x | create | start | pause | resume | report | ideas"
---

# /mirai

Use the Mirai MCP tools to operate Mirai AI - Autonomous Content Agent.

Command input: `$ARGUMENTS`

## Supported Actions

- `status`: call `mirai_get_campaign` and summarize campaign status, mode, connected X handle, expiry, and post counts.
- `activate <license>`: call `mirai_activate_license` with the license key, then call `mirai_healthcheck`.
- `connect-x`: call `mirai_connect_x` and summarize the connected account or OAuth next step.
- `create`: call `mirai_create_campaign` using the user's campaign brief and requested mode.
- `start`: call `mirai_get_campaign`, summarize account/mode/expiry/14-post limit, then ask for explicit approval before calling `mirai_start_autopost` with `approved=true`.
- `pause`: call `mirai_pause_autopost`, then call `mirai_get_campaign`.
- `resume`: call `mirai_get_campaign`, then call `mirai_resume_autopost` only if the license is valid and campaign can resume.
- `report`: call `mirai_get_report` and summarize campaign window, post counts, tweet URLs, and metrics.
- `ideas`: call `mirai_healthcheck`, connect X if needed, then call `mirai_generate_voice_ideas`.

## Operating Rules

1. Treat MCP tool results as the source of truth.
2. Never expose raw X tokens, refresh tokens, private license keys, database URLs, or `.env` secrets.
3. Never start autoposting without explicit user approval in the current conversation.
4. If a license is expired, revoked, or missing a scope, explain the status and do not post.
5. If no action is provided, call `mirai_healthcheck` and show a short menu of next actions.
6. Keep responses concise and practical.
