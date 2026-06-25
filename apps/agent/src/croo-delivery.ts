import type { LicenseDelivery } from "@mirai/shared";

export const MIRAI_PACKAGE_NAME = "@mirai-agent/mcp";
export const MIRAI_REPOSITORY = "zakyirsyaad/mirai-ai";
export const MIRAI_DOCS_URL = `https://github.com/${MIRAI_REPOSITORY}#buyer-quickstart`;
export const MIRAI_NEXT_STEPS =
  "Install the Mirai plugin/profile for Codex, Claude Code/CLI, or Hermes. Most buyers should run /mirai setup <license> after installing the plugin; advanced MCP users can call mirai_activate_license directly, then connect X through hosted OAuth.";

export function formatLicenseDeliveryText(
  deliverable: Pick<
    LicenseDelivery,
    | "service"
    | "orderId"
    | "licenseKey"
    | "expiresAt"
    | "installCommand"
    | "docsUrl"
    | "nextSteps"
  >,
  apiUrl: string,
): string {
  return [
    "Mirai AI license is ready.",
    "",
    `Service: ${deliverable.service}`,
    `Order ID: ${deliverable.orderId}`,
    `Expires at: ${deliverable.expiresAt}`,
    "",
    "License key:",
    deliverable.licenseKey,
    "",
    "Install Mirai plugin/profile:",
    "",
    "Codex:",
    `codex plugin marketplace add ${MIRAI_REPOSITORY} --ref main --sparse .agents --sparse plugins/mirai-codex`,
    "codex plugin add mirai-codex@mirai-ai",
    "",
    "Claude Code/CLI:",
    `claude plugin marketplace add ${MIRAI_REPOSITORY} --sparse .claude-plugin plugins/mirai-claude`,
    "claude plugin install mirai-claude@mirai-ai",
    "",
    "Hermes:",
    `hermes plugins install ${MIRAI_REPOSITORY} --enable`,
    `hermes mcp add mirai --command npx --env MIRAI_API_URL=${apiUrl} --args -y ${MIRAI_PACKAGE_NAME}@latest mcp`,
    "",
    "Advanced MCP fallback:",
    `npx -y ${MIRAI_PACKAGE_NAME}@latest mcp`,
    deliverable.installCommand,
    "",
    "Next steps:",
    deliverable.nextSteps,
    "",
    "Recommended command:",
    "/mirai setup <license>",
    "",
    `Docs: ${deliverable.docsUrl}`,
  ].join("\n");
}
