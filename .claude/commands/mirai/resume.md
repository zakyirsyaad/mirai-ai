Use the Mirai MCP tools to resume the current campaign.

Call `mirai_get_campaign` first. If the campaign is paused and the license is valid, call `mirai_resume_autopost`, then summarize the updated state. If the entitlement check fails, explain the failure and do not attempt posting.
