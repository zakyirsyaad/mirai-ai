export function redactA2ASecrets(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  return JSON.parse(
    JSON.stringify(value)
      .replace(/lc_live_[A-Za-z0-9_-]+/g, "lc_live_[redacted]")
      .replace(/\bPYGM-[A-Z0-9_-]{8,}\b/g, "[redacted-code]")
      .replace(/\bCAP-PRIVATE-[A-Z0-9_-]{8,}\b/g, "[redacted-code]")
      .replace(
        /((?:redeemable\s+)?code\s*:\s*)([A-Za-z0-9_-]{8,})/gi,
        "$1[redacted-code]",
      ),
  );
}
