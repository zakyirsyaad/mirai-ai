import { loadEnv } from "@mirai/shared";
import { readLocalLicense, writeLocalLicense } from "./license-store.js";

export function isHostedMode(): boolean {
  return loadEnv().MIRAI_RUNTIME_MODE === "hosted";
}

export async function hostedActivate(licenseKey: string): Promise<unknown> {
  const result = await request("/mcp/activate", {
    method: "POST",
    body: { licenseKey },
    licenseKey: null,
  });
  await writeLocalLicense(licenseKey.trim());
  return result;
}

export async function hostedHealthcheck(): Promise<unknown> {
  const env = loadEnv();
  let api: unknown;
  try {
    const res = await fetch(`${env.MIRAI_API_URL.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    api = await res.json();
  } catch (err) {
    api = err instanceof Error ? err.message : "unreachable";
  }
  let license: unknown;
  try {
    license = await request("/mcp/campaign", { method: "GET" });
  } catch (err) {
    license = err instanceof Error ? err.message : "not activated";
  }
  return {
    ok: typeof api === "object" && api !== null && "ok" in api ? Boolean(api.ok) : false,
    mode: "hosted",
    api,
    license,
  };
}

export async function hostedConnectX(): Promise<unknown> {
  const result = await request("/mcp/x/connect", { method: "POST" });
  if (
    result &&
    typeof result === "object" &&
    "authUrl" in result &&
    typeof result.authUrl === "string"
  ) {
    openBrowser(result.authUrl);
  }
  return result;
}

export async function hostedCreateCampaign(args: unknown): Promise<unknown> {
  return request("/mcp/campaign", { method: "POST", body: args });
}

export async function hostedSetVoiceProfile(args: unknown): Promise<unknown> {
  return request("/mcp/voice", { method: "POST", body: args });
}

export async function hostedAddContentItems(items: string[]): Promise<unknown> {
  return request("/mcp/content", { method: "POST", body: { items } });
}

export async function hostedStartAutopost(approved: boolean): Promise<unknown> {
  return request("/mcp/start", { method: "POST", body: { approved } });
}

export async function hostedPauseAutopost(): Promise<unknown> {
  return request("/mcp/pause", { method: "POST" });
}

export async function hostedResumeAutopost(): Promise<unknown> {
  return request("/mcp/resume", { method: "POST" });
}

export async function hostedGetCampaign(): Promise<unknown> {
  return request("/mcp/campaign", { method: "GET" });
}

export async function hostedGetReport(): Promise<unknown> {
  return request("/mcp/report", { method: "GET" });
}

export async function hostedGenerateVoiceIdeas(): Promise<unknown> {
  return request("/mcp/ideas", { method: "POST" });
}

async function request(
  path: string,
  args: {
    method: "GET" | "POST";
    body?: unknown;
    licenseKey?: string | null;
  },
): Promise<unknown> {
  const env = loadEnv();
  const licenseKey =
    args.licenseKey === undefined ? await requireLocalLicense() : args.licenseKey;
  const res = await fetch(`${env.MIRAI_API_URL.replace(/\/$/, "")}${path}`, {
    method: args.method,
    signal: AbortSignal.timeout(10_000),
    headers: {
      ...(licenseKey ? { Authorization: `Bearer ${licenseKey}` } : {}),
      ...(args.body ? { "Content-Type": "application/json" } : {}),
    },
    body: args.body ? JSON.stringify(args.body) : undefined,
  });
  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const message =
      json && typeof json === "object" && "error" in json
        ? String(json.error)
        : `Mirai hosted API failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

async function requireLocalLicense(): Promise<string> {
  const licenseKey = await readLocalLicense();
  if (!licenseKey) {
    throw new Error("Mirai is not activated. Run mirai_activate_license first.");
  }
  return licenseKey;
}

function openBrowser(url: string): void {
  void import("node:child_process").then(({ spawn }) => {
    const platform = process.platform;
    const command =
      platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
    const args = platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.unref();
  });
}
