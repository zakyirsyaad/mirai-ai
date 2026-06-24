# Mirai Cursor Profile

Cursor does not use the same marketplace plugin format as Codex or Claude Code,
so Mirai ships a Cursor profile:

- `.cursor/mcp.json` registers the Mirai MCP runtime through `npx`.
- `.cursor/rules/mirai.mdc` gives Cursor the Mirai workflow and safety rules.

Users do not need to run `npm install -g @mirai-agent/mcp`.

## Install

Copy these files into the project where Cursor will run:

```text
.cursor/mcp.json
.cursor/rules/mirai.mdc
```

Then restart Cursor and ask for Mirai actions naturally, for example:

```text
Use Mirai to check my campaign status.
Use Mirai to activate this license: ...
Use Mirai to connect X.
```
