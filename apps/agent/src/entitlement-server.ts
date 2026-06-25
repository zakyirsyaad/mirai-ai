import { createServer } from "node:http";
import { loadEnv } from "@mirai/shared";
import { checkEntitlement } from "./entitlements.js";
import {
  hostedActivate,
  hostedAddContentItems,
  hostedConnectX,
  hostedCreateCampaign,
  hostedGenerateVoiceIdeas,
  hostedGetCampaign,
  hostedGetReport,
  hostedHealth,
  hostedPauseAutopost,
  hostedResumeAutopost,
  hostedSetContentPolicy,
  hostedSetVoiceProfile,
  hostedStartAutopost,
  hostedXCallback,
} from "./hosted-tools.js";
import {
  createEntitlementRequestHandler,
  type HostedHandlers,
} from "./entitlement-handler.js";

const env = loadEnv();

const handlers: HostedHandlers = {
  checkEntitlement,
  hostedActivate,
  hostedAddContentItems,
  hostedConnectX,
  hostedCreateCampaign,
  hostedGenerateVoiceIdeas,
  hostedGetCampaign,
  hostedGetReport,
  hostedHealth,
  hostedPauseAutopost,
  hostedResumeAutopost,
  hostedSetContentPolicy,
  hostedSetVoiceProfile,
  hostedStartAutopost,
  hostedXCallback,
};

export function startEntitlementServer(): { close: () => void } {
  const server = createServer(createEntitlementRequestHandler(handlers));

  server.listen(env.MIRAI_ENTITLEMENT_PORT, () => {
    console.log(
      `[entitlement] listening on http://localhost:${env.MIRAI_ENTITLEMENT_PORT}`,
    );
  });

  return {
    close: () => server.close(),
  };
}
