---
description: Guided first-run setup for Mirai autoposting.
argument-hint: "<license>"
---

Guide the full first-run Mirai setup.

1. If the user included a license key, call `mirai_activate_license`; otherwise ask for it.
2. Call `mirai_healthcheck` and summarize service and expiry.
3. Call `mirai_connect_x`; if OAuth opens, wait for the callback flow to complete.
4. Ask for a compact campaign brief if missing: niche, audience, goal, content mode, and tone.
5. Call `mirai_create_campaign`.
6. Ask for content filters if missing: allowed topics, blocked topics, blocked phrases, language, tone rules, format rules, and approval-only subjects.
7. Call `mirai_set_content_policy`.
8. If user-supplied mode is selected, ask for content items and call `mirai_add_content_items`.
9. Call `mirai_get_campaign`, summarize connected account, mode, expiry, 14-post limit, and active content policy.
10. Ask for explicit approval before calling `mirai_start_autopost` with `approved=true`.

Never start autoposting during setup unless the user clearly approves in the current conversation.
Never request or expose raw X tokens, refresh tokens, private license keys, database URLs, Redis passwords, or `.env` secrets.
