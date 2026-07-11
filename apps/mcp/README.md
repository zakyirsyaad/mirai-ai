# @mirai-agent/mcp

Mirai MCP client for CROO-licensed autonomous X campaigns.

## Install

```bash
npm install -g @mirai-agent/mcp
mirai doctor
```

## MCP Server

Use this command in Codex, Claude Code/CLI, Hermes, or another MCP-capable
client:

```bash
mirai mcp
```

Generic MCP config:

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

## Hosted API

The package defaults to hosted mode at
`https://mirai.43-129-56-85.sslip.io`. Remote API overrides must use HTTPS;
plain HTTP is accepted only for `localhost`, `127.0.0.1`, or `::1` development.

To override the API URL:

```bash
MIRAI_API_URL=https://api.example.com mirai mcp
```

or:

```bash
mirai init --hosted --api-url https://api.example.com --force
```

## Flow

1. Buy a Mirai service on CROO.
2. Copy the delivered `mirai_v1.<payload>.<signature>` license key.
3. Activate it with the `mirai_activate_license` MCP tool.
4. Connect X with `mirai_connect_x`.
5. Use Mirai from your MCP client.

## Tools

- `mirai_healthcheck`, `mirai_activate_license`, `mirai_connect_x`
- `mirai_create_campaign`, `mirai_set_voice_profile`, `mirai_set_content_policy`
- `mirai_add_content_items`, `mirai_list_content_items`
- `mirai_update_content_item`, `mirai_delete_content_item`
- `mirai_start_autopost`, `mirai_pause_autopost`, `mirai_resume_autopost`
- `mirai_get_campaign`, `mirai_get_report`, `mirai_generate_voice_ideas`
