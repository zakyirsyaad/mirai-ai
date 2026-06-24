import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadEnv } from "@mirai/shared";
import { checkEntitlement, type SensitiveAction } from "./entitlements.js";
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
  hostedSetVoiceProfile,
  hostedStartAutopost,
  hostedXCallback,
} from "./hosted-tools.js";

const env = loadEnv();

export function startEntitlementServer(): { close: () => void } {
  const server = createServer((req, res) => {
    void route(req, res).catch((err) => {
      writeJson(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : "internal error",
      });
    });
  });

  server.listen(env.MIRAI_ENTITLEMENT_PORT, () => {
    console.log(
      `[entitlement] listening on http://localhost:${env.MIRAI_ENTITLEMENT_PORT}`,
    );
  });

  return {
    close: () => server.close(),
  };
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", env.MIRAI_API_URL);

  if (req.method === "GET" && url.pathname === "/health") {
    writeJson(res, 200, await hostedHealth());
    return;
  }

  if (req.method === "GET" && url.pathname === "/oauth/x/callback") {
    const message = await hostedXCallback(url);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(message);
    return;
  }

  if (req.method === "POST" && url.pathname === "/entitlements/check") {
    const body = (await readJson(req)) as {
      licenseKey?: string;
      action?: SensitiveAction;
    };
    if (!body.licenseKey || !body.action) {
      writeJson(res, 400, { ok: false, error: "licenseKey and action required" });
      return;
    }
    const result = await checkEntitlement({
      licenseKey: body.licenseKey,
      action: body.action,
    });
    if (!result.ok) {
      writeJson(res, 403, { ok: false, error: result.reason });
      return;
    }
    writeJson(res, 200, { ok: true, payload: result.payload });
    return;
  }

  if (url.pathname.startsWith("/mcp/")) {
    await routeHostedMcp(req, res, url);
    return;
  }

  writeJson(res, 404, { ok: false, error: "not found" });
}

async function routeHostedMcp(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (req.method === "POST" && url.pathname === "/mcp/activate") {
    const body = (await readJson(req)) as { licenseKey?: string };
    if (!body.licenseKey) {
      writeJson(res, 400, { ok: false, error: "licenseKey required" });
      return;
    }
    writeJson(res, 200, await hostedActivate(body.licenseKey));
    return;
  }

  const licenseKey = readBearer(req);
  if (!licenseKey) {
    writeJson(res, 401, { ok: false, error: "Bearer license required" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp/x/connect") {
    writeJson(res, 200, await hostedConnectX(licenseKey));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/campaign") {
    writeJson(res, 200, await hostedCreateCampaign(licenseKey, (await readJson(req)) as never));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/voice") {
    writeJson(res, 200, await hostedSetVoiceProfile(licenseKey, (await readJson(req)) as never));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/content") {
    const body = (await readJson(req)) as { items?: string[] };
    writeJson(res, 200, await hostedAddContentItems(licenseKey, body.items ?? []));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/start") {
    const body = (await readJson(req)) as { approved?: boolean };
    writeJson(res, 200, await hostedStartAutopost(licenseKey, body.approved === true));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/pause") {
    writeJson(res, 200, await hostedPauseAutopost(licenseKey));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/resume") {
    writeJson(res, 200, await hostedResumeAutopost(licenseKey));
    return;
  }
  if (req.method === "GET" && url.pathname === "/mcp/campaign") {
    writeJson(res, 200, await hostedGetCampaign(licenseKey));
    return;
  }
  if (req.method === "GET" && url.pathname === "/mcp/report") {
    writeJson(res, 200, await hostedGetReport(licenseKey));
    return;
  }
  if (req.method === "POST" && url.pathname === "/mcp/ideas") {
    writeJson(res, 200, await hostedGenerateVoiceIdeas(licenseKey));
    return;
  }

  writeJson(res, 404, { ok: false, error: "not found" });
}

function readBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
