---
name: mirai
description: Operate Mirai AI through Claude Code/CLI using the bundled Mirai MCP runtime.
---

# Mirai AI

Use Mirai through the bundled MCP tools. The plugin starts
`@mirai-agent/mcp` through `npx`, so users do not need to install a global MCP
package.

## Flow

For guided setup, use `/mirai:setup` or follow this order:

1. Activate the license.
2. Run healthcheck.
3. Connect X.
4. Collect the campaign brief.
5. Create the campaign.
6. Set content filters.
7. Read campaign status.
8. Ask for explicit approval before starting.

For individual actions:

1. Call `mirai_healthcheck`.
2. Activate the license with `mirai_activate_license` if needed.
3. Connect X with `mirai_connect_x`.
4. Create a campaign with `mirai_create_campaign`.
5. Set content filters with `mirai_set_content_policy` when the user gives allowed topics, blocked topics, blocked phrases, language, tone, format, or approval-only subjects.
6. Start posting only after explicit user approval.
7. Use `mirai_get_campaign` for status and `mirai_get_report` for proof.

Never request or expose raw X tokens, refresh tokens, private license keys,
database URLs, Redis passwords, or `.env` secrets.
Confirm active content filters before starting autopost.
