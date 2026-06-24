# Mirai Codex Plugin

Codex-native plugin for Mirai AI - Autonomous Content Agent.

This plugin provides:

- Mirai MCP server config.
- `/mirai` command workflow.
- Mirai skill instructions for safe license activation, X connection, campaign control, and reports.

## Install From GitHub

Users do not run `plugin-creator`. This plugin has already been created with the
plugin-creator workflow and is published inside the Mirai repo as a Codex
marketplace entry.

```bash
codex plugin marketplace add zakyirsyaad/mirai-ai --ref main --sparse .agents --sparse plugins/mirai-codex
codex plugin add mirai-codex@mirai-ai
```

Then restart Codex or open a new thread.

## Requirements

- Node.js 20+
- npm access to `@mirai-agent/mcp`
- A signed Mirai license delivered by CROO

The MCP config uses:

```bash
npx -y @mirai-agent/mcp@latest mcp
```

so users do not need a global MCP install.

## Commands

```text
/mirai
/mirai status
/mirai activate <license>
/mirai connect-x
/mirai create <campaign brief>
/mirai start
/mirai pause
/mirai resume
/mirai report
/mirai ideas
```

## Hosted API

During VPS testing, the plugin points to:

```text
http://mirai.43-129-56-85.sslip.io
```

Switch this to `https://api.mirai-agent.com` after the production API domain is live.
