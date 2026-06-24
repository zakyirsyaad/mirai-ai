---
description: Generate Mirai voice profile and content ideas.
---

Use the Mirai MCP tools for the read-only Voice & Ideas service.

Call `mirai_healthcheck`. If X is not connected, call `mirai_connect_x`. Then
call `mirai_generate_voice_ideas` and present the voice profile plus ideas. Do
not call posting or campaign-start tools.
