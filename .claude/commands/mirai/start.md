Use the Mirai MCP tools to start autoposting.

First call `mirai_get_campaign`. Summarize the connected X handle, campaign mode, expiry, and the 14-post limit. Ask for explicit approval if the user has not already approved in this message. Only after explicit approval, call `mirai_start_autopost` with `approved=true`.

Never start autoposting if the license is expired, X is not connected, or voice profile is missing.
