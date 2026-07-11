import { loadConfig, resolveMiraiApiUrl } from "./config.js";
import { readLocalLicense, writeLocalLicense } from "./license-store.js";
import { verifyLicense } from "./license.js";

interface HostedRequestArgs {
  method: "DELETE" | "GET" | "PATCH" | "POST";
  body?: unknown;
  licenseKey?: string | null;
}

interface HostedRequesterDependencies {
  loadConfig?: typeof loadConfig;
  readLocalLicense?: typeof readLocalLicense;
  fetch?: typeof fetch;
}

export function isHostedMode(): boolean {
  return true;
}

export async function hostedActivate(licenseKey: string): Promise<unknown> {
  const config = loadConfig();
  verifyLicense(licenseKey.trim(), config.licensePublicKey);
  const result = await request("/mcp/activate", {
    method: "POST",
    body: { licenseKey },
    licenseKey: null,
  });
  await writeLocalLicense(licenseKey.trim());
  return result;
}

export async function hostedHealthcheck(): Promise<unknown> {
  const config = loadConfig();
  let api: unknown;
  try {
    const res = await fetch(resolveHostedUrl(config.apiUrl, "/health"), {
      signal: AbortSignal.timeout(5_000),
      redirect: "error",
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
    apiUrl: config.apiUrl,
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
    openBrowser(resolveXAuthorizationUrl(result.authUrl));
  }
  return result;
}

export async function hostedCreateCampaign(args: unknown): Promise<unknown> {
  return request("/mcp/campaign", { method: "POST", body: args });
}

export async function hostedSetVoiceProfile(args: unknown): Promise<unknown> {
  return request("/mcp/voice", { method: "POST", body: args });
}

export async function hostedSetContentPolicy(args: unknown): Promise<unknown> {
  return request("/mcp/policy", { method: "POST", body: args });
}

export async function hostedAddContentItems(items: string[]): Promise<unknown> {
  return request("/mcp/content", { method: "POST", body: { items } });
}

export async function hostedListContentItems(): Promise<unknown> {
  return request("/mcp/content", { method: "GET" });
}

export async function hostedUpdateContentItem(
  itemId: string,
  rawText: string,
): Promise<unknown> {
  return request(`/mcp/content/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: { rawText },
  });
}

export async function hostedDeleteContentItem(itemId: string): Promise<unknown> {
  return request(`/mcp/content/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
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

export function createHostedRequester(
  dependencies: HostedRequesterDependencies = {},
): (path: string, args: HostedRequestArgs) => Promise<unknown> {
  const loadConfigImpl = dependencies.loadConfig ?? loadConfig;
  const readLocalLicenseImpl = dependencies.readLocalLicense ?? readLocalLicense;
  const fetchImpl = dependencies.fetch ?? fetch;

  return async (path: string, args: HostedRequestArgs): Promise<unknown> => {
    const config = loadConfigImpl();
    const url = resolveHostedUrl(config.apiUrl, path);
    const licenseKey =
      args.licenseKey === undefined
        ? await requireLicense(readLocalLicenseImpl)
        : args.licenseKey;
    const res = await fetchImpl(url, {
      method: args.method,
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
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
  };
}

const request = createHostedRequester();

function resolveHostedUrl(apiUrl: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Mirai hosted request path must be relative to the API origin.");
  }
  return `${resolveMiraiApiUrl(apiUrl)}${path}`;
}

export function resolveXAuthorizationUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Mirai received an invalid X authorization URL.");
  }
  const expectedHost = url.hostname === "x.com" || url.hostname === "twitter.com";
  if (
    url.protocol !== "https:" ||
    !expectedHost ||
    url.pathname !== "/i/oauth2/authorize" ||
    url.username ||
    url.password
  ) {
    throw new Error("Mirai received an unexpected X authorization URL.");
  }
  return url.toString();
}

async function requireLicense(
  readLicense: typeof readLocalLicense,
): Promise<string> {
  const licenseKey = await readLicense();
  if (!licenseKey) {
    throw new Error("Mirai is not activated. Run mirai_activate_license first.");
  }
  return licenseKey;
}

function openBrowser(url: string): void {
  void import("node:child_process").then(({ spawn }) => {
    const platform = process.platform;
    const command =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "rundll32"
          : "xdg-open";
    const args =
      platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.unref();
  });
}
