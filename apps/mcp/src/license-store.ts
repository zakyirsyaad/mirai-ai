import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import {
  verifyLicense,
  type LicensePayload,
  type VerifiedLicense,
} from "./license.js";

export const MIRAI_HOME = join(homedir(), ".mirai");
export const LICENSE_PATH = join(MIRAI_HOME, "license");

export async function writeLocalLicense(licenseKey: string): Promise<void> {
  await mkdir(MIRAI_HOME, { recursive: true, mode: 0o700 });
  await writeFile(LICENSE_PATH, `${licenseKey.trim()}\n`, { mode: 0o600 });
}

export async function readLocalLicense(): Promise<string | null> {
  try {
    return (await readFile(LICENSE_PATH, "utf8")).trim();
  } catch {
    return null;
  }
}

export async function requireVerifiedLicense(): Promise<VerifiedLicense> {
  const licenseKey = await readLocalLicense();
  if (!licenseKey) {
    throw new Error("Mirai is not activated. Run mirai_activate_license first.");
  }
  const config = loadConfig();
  if (!config.licensePublicKey) {
    throw new Error("MIRAI_LICENSE_PUBLIC_KEY is required to verify licenses.");
  }
  return verifyLicense(licenseKey, config.licensePublicKey);
}

export async function getLocalLicensePayload(): Promise<LicensePayload | null> {
  const licenseKey = await readLocalLicense();
  if (!licenseKey) return null;
  const config = loadConfig();
  if (!config.licensePublicKey) return null;
  try {
    return verifyLicense(licenseKey, config.licensePublicKey).payload;
  } catch {
    return null;
  }
}
