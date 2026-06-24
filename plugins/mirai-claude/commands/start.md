---
description: Start Mirai autoposting after explicit approval.
---

Use the Mirai MCP tools to start autoposting.

First call `mirai_get_campaign`. Summarize the connected X handle, campaign
mode, expiry, 14-post limit, and active content policy. If no content policy is
set, ask the user to confirm what Mirai should and should not post about before
starting. Ask for explicit approval if the user has not already approved in this
message. Only after explicit approval, call `mirai_start_autopost` with
`approved=true`.

Never start autoposting if the license is expired, X is not connected, or the
voice profile is missing.
