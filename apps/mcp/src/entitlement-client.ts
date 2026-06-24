import { loadEnv, type LicensePayload } from "@mirai/shared";

export type SensitiveAction = "activate" | "start" | "resume" | "post" | "deliver";

export async function checkRemoteEntitlement(args: {
  licenseKey: string;
  action: SensitiveAction;
}): Promise<LicensePayload> {
  const env = loadEnv();
  const res = await fetch(`${env.MIRAI_ENTITLEMENT_API_URL}/entitlements/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = (await res.json()) as {
    ok: boolean;
    payload?: LicensePayload;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.payload) {
    throw new Error(json.error ?? `entitlement check failed (${res.status})`);
  }
  return json.payload;
}
