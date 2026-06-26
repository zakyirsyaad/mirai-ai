---
description: Control Mirai AI campaigns through the Mirai MCP server.
argument-hint: "setup <license> | status | activate <license> | connect-x | create | content list|edit|delete | policy | start | pause | resume | report | ideas"
---

# /mirai

Use the Mirai MCP tools to operate Mirai AI - Autonomous Content Agent.

Command input: `$ARGUMENTS`

## Supported Actions

- `status`: call `mirai_get_campaign` and summarize campaign status, mode, connected X handle, expiry, and post counts.
- `setup <license>`: guide the full first-run flow: activate license, healthcheck, connect X, create campaign brief, set content policy, then summarize and ask for explicit approval before starting.
- `activate <license>`: call `mirai_activate_license` with the license key, then call `mirai_healthcheck`.
- `connect-x`: call `mirai_connect_x` and summarize the connected account or OAuth next step.
- `create`: call `mirai_create_campaign` using the user's campaign brief and requested mode.
- `content list`: call `mirai_list_content_items` and show ids, status, editable flag, and short previews.
- `content edit <id> <text>`: call `mirai_update_content_item` only for pending items; if no text is provided, ask for the revised text.
- `content delete <id>`: call `mirai_delete_content_item` only for pending items; explain that used/posted items cannot be changed.
- `policy`: call `mirai_set_content_policy` using allowed topics, blocked topics, blocked phrases, language, tone rules, format rules, and approval-only subjects from the user's request.
- `start`: call `mirai_get_campaign`, summarize account/mode/expiry/14-post limit/content policy, then ask for explicit approval before calling `mirai_start_autopost` with `approved=true`.
- `pause`: call `mirai_pause_autopost`, then call `mirai_get_campaign`.
- `resume`: call `mirai_get_campaign`, then call `mirai_resume_autopost` only if the license is valid and campaign can resume.
- `report`: call `mirai_get_report` and summarize campaign window, post counts, tweet URLs, and metrics.
- `ideas`: call `mirai_healthcheck`, connect X if needed, then call `mirai_generate_voice_ideas`.

## Operating Rules

1. Treat MCP tool results as the source of truth.
2. Never expose raw X tokens, refresh tokens, private license keys, database URLs, or `.env` secrets.
3. Never start autoposting without explicit user approval in the current conversation.
4. Confirm content filters before starting autopost when the user has not provided them.
5. Let users revise or delete queued user-supplied content with the content tools before Mirai uses it.
6. If a license is expired, revoked, or missing a scope, explain the status and do not post.
7. If no action is provided, call `mirai_healthcheck` and show a short menu of next actions.
8. Keep responses concise and practical.

## Setup Flow

For `/mirai setup <license>`:

1. Activate the license with `mirai_activate_license`, then call `mirai_healthcheck`.
2. Call `mirai_connect_x` and wait for the OAuth callback when needed.
3. Ask for a compact campaign brief if the user has not provided one: niche, audience, goal, mode, and tone.
4. Call `mirai_create_campaign` with the brief.
5. Ask for content filters if missing: allowed topics, blocked topics, blocked phrases, language, tone rules, format rules, and approval-only subjects.
6. Call `mirai_set_content_policy`.
7. If the user chose user-supplied mode, ask for content items and call `mirai_add_content_items`.
8. Call `mirai_get_campaign`, summarize the account, expiry, mode, 14-post limit, and policy.
9. Ask for explicit approval. Only call `mirai_start_autopost` with `approved=true` after the user clearly approves.
