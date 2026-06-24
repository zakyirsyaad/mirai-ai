---
description: Set Mirai content filters before autoposting.
---

Use `mirai_set_content_policy` to configure what Mirai may post automatically.

Map the user's request into:

- `allowedTopics`
- `blockedTopics`
- `blockedPhrases`
- `language`
- `toneRules`
- `formatRules`
- `requireApprovalFor`

After saving, call `mirai_get_campaign` and summarize the active content policy.
