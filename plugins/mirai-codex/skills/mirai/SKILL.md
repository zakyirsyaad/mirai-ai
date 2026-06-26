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
6. Call `mirai_set_content_policy` when the user gives allowed topics, blocked topics, blocked phrases, language, tone, format, or approval-only subjects.
7. Call `mirai_add_content_items` only for user-supplied mode.
8. Use `mirai_list_content_items`, `mirai_update_content_item`, and `mirai_delete_content_item` when the user wants to review, revise, or remove queued user-supplied content.
9. Before posting, summarize connected account, campaign mode, expiry, 14-post limit, and active content policy.
10. Call `mirai_start_autopost` with `approved=true` only after explicit user approval.
11. Use `mirai_get_campaign` for status and `mirai_get_report` for proof of work.

## Slash Command UX

When the user invokes `/mirai`, map the subcommand naturally:

- `/mirai status` -> `mirai_get_campaign`
- `/mirai setup <license>` -> guided activation, X OAuth, campaign brief, content policy, status summary, then approval-gated start
- `/mirai activate <license>` -> `mirai_activate_license`, then `mirai_healthcheck`
- `/mirai connect-x` -> `mirai_connect_x`
- `/mirai create ...` -> `mirai_create_campaign`
- `/mirai content list` -> `mirai_list_content_items`
- `/mirai content edit <id> <text>` -> `mirai_update_content_item`
- `/mirai content delete <id>` -> `mirai_delete_content_item`
- `/mirai policy ...` -> `mirai_set_content_policy`
- `/mirai start` -> summarize, ask for approval if missing, then `mirai_start_autopost`
- `/mirai pause` -> `mirai_pause_autopost`
- `/mirai resume` -> `mirai_get_campaign`, then `mirai_resume_autopost`
- `/mirai report` -> `mirai_get_report`
- `/mirai ideas` -> `mirai_generate_voice_ideas`

## Guided Setup

For `/mirai setup <license>`, guide the user through the smallest complete path:

1. Activate the license and run healthcheck.
2. Connect X and wait for OAuth completion if needed.
3. Collect campaign brief: niche, audience, goal, content mode, and tone.
4. Create the campaign.
5. Collect content policy: allowed topics, blocked topics, blocked phrases, language, tone rules, format rules, and approval-only subjects.
6. Save the policy.
7. For user-supplied mode, collect content items before start.
8. Read campaign status and summarize account, expiry, mode, 14-post limit, and policy.
9. Ask for explicit approval before calling start.

## Safety

- Never request or print raw X access tokens, refresh tokens, private license keys, database URLs, Redis passwords, or `.env` secrets.
- Do not bypass Mirai by posting directly to X or editing the database unless the user explicitly asks for maintenance/debugging.
- Only pending content items can be revised or deleted. If an item is already used by a post slot, explain that it is locked and point the user to campaign/report status.
- Confirm content filters before starting autopost when the user has not provided them yet.
- If entitlement verification fails, stop and explain the actionable next step.
- If OAuth opens, let the browser callback finish. Do not ask the user to paste tokens.
