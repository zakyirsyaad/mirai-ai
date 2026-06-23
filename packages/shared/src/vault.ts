import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Token vault — AES-256-GCM encryption for X OAuth tokens at rest.
 *
 * We custody users' X refresh tokens, so they are never stored in plaintext.
 * The 32-byte key comes from `TOKEN_VAULT_KEY` (hex). For the hackathon an
 * env-held key is acceptable; production should move to a KMS.
 *
 * Wire format (single string, colon-separated, all base64):
 *   v1:<iv>:<authTag>:<ciphertext>
 */
const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32;

function loadKey(hexKey: string | undefined): Buffer {
  if (!hexKey) {
    throw new Error(
      "TOKEN_VAULT_KEY is not set. Generate one with: openssl rand -hex 32",
    );
  }
  const key = Buffer.from(hexKey, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_VAULT_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars), got ${key.length}`,
    );
  }
  return key;
}

/** Encrypt a plaintext token. Returns an opaque `v1:iv:tag:ct` string. */
export function encryptToken(plaintext: string, hexKey: string): string {
  const key = loadKey(hexKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(":");
}

/** Decrypt a `v1:iv:tag:ct` string back to plaintext. Throws if tampered. */
export function decryptToken(payload: string, hexKey: string): string {
  const key = loadKey(hexKey);
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed vault payload");
  }
  const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}

/** Constant-time string compare for OAuth `state` / token equality checks. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
