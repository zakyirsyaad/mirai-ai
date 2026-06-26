import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const files = execFileSync(
  "git",
  ["-C", repoRoot, "ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !/(^|\/)(node_modules|dist|\.next)\//.test(file))
  .filter((file) => file !== "pnpm-lock.yaml")
  .filter(
    (file) =>
      file !== "apps/agent/scripts/security-scan.mjs" &&
      file !== "scripts/security-scan.mjs",
  );

const patterns = [
  {
    name: "CROO SDK key",
    regex: new RegExp("croo_sk_" + "[A-Za-z0-9]+", "g"),
  },
  {
    name: "live MCP token",
    regex: new RegExp("lc_" + "live_[A-Za-z0-9_-]+", "g"),
  },
  {
    name: "private downstream capability code",
    regex: /\b(?:PYGM|CAP-PRIVATE)-[A-Z0-9_-]{8,}\b/g,
  },
  {
    name: "populated ANTHROPIC_API_KEY",
    regex: new RegExp("ANTHROPIC_API_KEY=" + "[^\\n]*\\S", "g"),
  },
  {
    name: "populated OPENMODEL_API_KEY",
    regex: new RegExp("OPENMODEL_API_KEY=" + "[^\\n]*\\S", "g"),
  },
  {
    name: "OpenModel API key",
    regex: new RegExp("om-" + "[A-Za-z0-9_-]{20,}", "g"),
  },
  {
    name: "populated TOKEN_VAULT_KEY",
    regex: new RegExp("TOKEN_VAULT_KEY=" + "[^\\n]*\\S", "g"),
  },
  {
    name: "populated X_CLIENT_SECRET",
    regex: new RegExp("X_CLIENT_SECRET=" + "[^\\n]*\\S", "g"),
  },
  {
    name: "populated CROO_SDK_KEY",
    regex: new RegExp("CROO_SDK_KEY=" + "[^\\n]*\\S", "g"),
  },
];

const allowlistedMatches = [
  {
    file: "apps/mcp/src/cli.ts",
    includes: "TOKEN_VAULT_KEY=${randomBytes(32).toString(\"hex\")}",
  },
];

const findings = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(repoRoot, file), "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0];
      const allowed = allowlistedMatches.some(
        (rule) => rule.file === file && value.includes(rule.includes),
      );
      if (!allowed) {
        const line = text.slice(0, match.index).split(/\r?\n/).length;
        findings.push({ file, line, pattern: pattern.name, value });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ ok: false, findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesScanned: files.length }, null, 2));
