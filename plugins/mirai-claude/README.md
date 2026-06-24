# Mirai Claude Plugin

Claude Code/CLI wrapper for Mirai AI - Autonomous Content Agent.

Users install the plugin; the plugin starts the Mirai MCP runtime through
`npx -y @mirai-agent/mcp@latest mcp` behind the scenes. Users do not need to
install the MCP package globally.

## Install

```bash
claude plugin marketplace add zakyirsyaad/mirai-ai --sparse .claude-plugin plugins/mirai-claude
claude plugin install mirai-claude@mirai-ai
```

Restart Claude Code/CLI after installation.

## Commands

```text
/mirai:status
/mirai:activate
/mirai:connect-x
/mirai:ideas
/mirai:start
/mirai:pause
/mirai:resume
/mirai:report
```
