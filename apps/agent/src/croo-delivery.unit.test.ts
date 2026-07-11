import test from "node:test";
import assert from "node:assert/strict";
import { ServiceType } from "@mirai/shared";
import {
  formatLicenseDeliveryText,
  MIRAI_DOCS_URL,
  MIRAI_NEXT_STEPS,
  MIRAI_PACKAGE_NAME,
} from "./croo-delivery.js";

test("formats CROO license delivery with current plugin install flow", () => {
  const text = formatLicenseDeliveryText(
    {
      service: ServiceType.ContentAgent7d,
      orderId: "croo-order-1",
      licenseKey: "mirai_v1.payload.signature",
      expiresAt: "2026-07-02T12:49:47.757Z",
      installCommand: `npm install -g ${MIRAI_PACKAGE_NAME}`,
      docsUrl: MIRAI_DOCS_URL,
      nextSteps: MIRAI_NEXT_STEPS,
    },
    "https://mirai.43-129-56-85.sslip.io",
  );

  assert.match(text, /codex plugin marketplace add zakyirsyaad\/mirai-ai/);
  assert.match(text, /claude plugin marketplace add zakyirsyaad\/mirai-ai/);
  assert.match(text, /hermes plugins install zakyirsyaad\/mirai-ai --enable/);
  assert.match(text, /npx -y @mirai-agent\/mcp@latest mcp/);
  assert.match(text, /\/mirai setup <license>/);
  assert.match(text, /https:\/\/github.com\/zakyirsyaad\/mirai-ai#buyer-quickstart/);
  assert.doesNotMatch(text, /@mirai\/mcp/);
  assert.doesNotMatch(text, /github.com\/0xAlvary\/mirai-ai/);
});
