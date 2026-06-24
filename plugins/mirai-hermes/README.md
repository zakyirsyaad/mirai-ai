# Mirai Hermes Plugin

Hermes can install this repository as a plugin:

```bash
hermes plugins install zakyirsyaad/mirai-ai --enable
```

Then register the Mirai runtime once:

```bash
hermes mcp add mirai --command npx --env MIRAI_API_URL=http://mirai.43-129-56-85.sslip.io --args -y @mirai-agent/mcp@latest mcp
hermes mcp test mirai
```

Users do not install `@mirai-agent/mcp` globally; Hermes runs it through `npx`.

After setup, ask Hermes:

```text
Use Mirai to check campaign status.
Use Mirai to activate my license.
Use Mirai to connect X.
Use Mirai to generate voice ideas.
```
