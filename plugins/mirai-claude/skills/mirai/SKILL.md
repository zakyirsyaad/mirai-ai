---
name: mirai
description: Operate Mirai AI through Claude Code using the bundled Mirai MCP runtime.
---

# Mirai AI

Use Mirai through the bundled MCP tools. The plugin starts
`@mirai-agent/mcp` through `npx`, so users do not need to install a global MCP
package.

## Flow

1. Call `mirai_healthcheck`.
2. Activate the license with `mirai_activate_license` if needed.
3. Connect X with `mirai_connect_x`.
4. Create a campaign with `mirai_create_campaign`.
5. Start posting only after explicit user approval.
6. Use `mirai_get_campaign` for status and `mirai_get_report` for proof.

Never request or expose raw X tokens, refresh tokens, private license keys,
database URLs, Redis passwords, or `.env` secrets.
