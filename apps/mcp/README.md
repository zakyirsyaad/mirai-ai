# @mirai-agent/mcp

Mirai MCP client for CROO-licensed autonomous X campaigns.

## Install

```bash
npm install -g @mirai-agent/mcp
mirai doctor
```

## MCP Server

Use this command in Claude Code, Codex, Cursor, Hermes, or any MCP client:

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

The package defaults to hosted mode at `http://mirai.43-129-56-85.sslip.io`
while Mirai is running on the temporary VPS URL. This will move to
`https://api.mirai-agent.com` after the production API domain is connected.

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
