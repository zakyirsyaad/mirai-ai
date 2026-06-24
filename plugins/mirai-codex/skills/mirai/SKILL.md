---
name: mirai
description: Operate Mirai AI through Codex using the bundled Mirai MCP server and /mirai workflow.
---

# Mirai AI

Use Mirai through MCP tools. Mirai is a CROO-licensed autonomous X content agent with hosted worker runtime. Codex users should not run Docker, Postgres, Redis, or `mirai worker` for the normal hosted flow.

## Default Flow

1. Call `mirai_healthcheck`.
2. If not activated, call `mirai_activate_license` with the user's signed license key.
3. Call `mirai_connect_x`.
4. Call `mirai_create_campaign` with the user's brief and chosen mode.
5. Call `mirai_set_voice_profile` if the user supplies explicit voice guidance.
6. Call `mirai_add_content_items` only for user-supplied mode.
7. Before posting, summarize connected account, campaign mode, expiry, and 14-post limit.
8. Call `mirai_start_autopost` with `approved=true` only after explicit user approval.
9. Use `mirai_get_campaign` for status and `mirai_get_report` for proof of work.

## Slash Command UX

When the user invokes `/mirai`, map the subcommand naturally:

- `/mirai status` -> `mirai_get_campaign`
- `/mirai activate <license>` -> `mirai_activate_license`, then `mirai_healthcheck`
- `/mirai connect-x` -> `mirai_connect_x`
- `/mirai create ...` -> `mirai_create_campaign`
- `/mirai start` -> summarize, ask for approval if missing, then `mirai_start_autopost`
- `/mirai pause` -> `mirai_pause_autopost`
- `/mirai resume` -> `mirai_get_campaign`, then `mirai_resume_autopost`
- `/mirai report` -> `mirai_get_report`
- `/mirai ideas` -> `mirai_generate_voice_ideas`

## Safety

- Never request or print raw X access tokens, refresh tokens, private license keys, database URLs, Redis passwords, or `.env` secrets.
- Do not bypass Mirai by posting directly to X or editing the database unless the user explicitly asks for maintenance/debugging.
- If entitlement verification fails, stop and explain the actionable next step.
- If OAuth opens, let the browser callback finish. Do not ask the user to paste tokens.
