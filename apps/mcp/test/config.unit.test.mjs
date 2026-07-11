import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import * as configModule from "../dist/config.js";

const execFileAsync = promisify(execFile);
const CANONICAL_API_URL = "https://mirai.43-129-56-85.sslip.io";
const LEGACY_API_URL = "http://mirai.43-129-56-85.sslip.io";

test("remote HTTP API URLs fail closed", () => {
  assert.equal(typeof configModule.resolveMiraiApiUrl, "function");
  for (const value of [
    "http://example.com",
    "http://localhost.evil.com",
    "http://192.168.1.10:8787",
    "http://0.0.0.0:8787",
  ]) {
    assert.throws(
      () => configModule.resolveMiraiApiUrl(value),
      /HTTPS|loopback/i,
      value,
    );
  }
  assert.throws(() => configModule.resolveMiraiApiUrl("not-a-url"), /valid URL/);
});

test("loopback HTTP remains available for explicit local development", () => {
  for (const value of [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ]) {
    assert.equal(configModule.resolveMiraiApiUrl(value), value);
  }
});

test("legacy hosted HTTP URL migrates to the canonical HTTPS endpoint", () => {
  assert.equal(configModule.resolveMiraiApiUrl(LEGACY_API_URL), CANONICAL_API_URL);
});

test("API URL rejects credentials, paths, queries, and fragments", () => {
  for (const value of [
    "https://user:pass@example.com",
    "https://example.com/api",
    "https://example.com?target=other",
    "https://example.com#fragment",
  ]) {
    assert.throws(() => configModule.resolveMiraiApiUrl(value), /origin|credential/i);
  }
});

test("loadConfig ignores workspace .env and reads only Mirai home config", async () => {
  const root = await mkdtemp(join(tmpdir(), "mirai-config-"));
  const homeDir = join(root, "home");
  const workspace = join(root, "workspace");
  const previousCwd = process.cwd();
  await mkdir(join(homeDir, ".mirai"), { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(
    join(homeDir, ".mirai", ".env"),
    `MIRAI_API_URL=${CANONICAL_API_URL}\nMIRAI_LICENSE_PUBLIC_KEY=home-public-key\n`,
  );
  await writeFile(
    join(workspace, ".env"),
    "MIRAI_API_URL=https://attacker.example\nMIRAI_LICENSE_PUBLIC_KEY=attacker-key\n",
  );

  try {
    process.chdir(workspace);
    const config = configModule.loadConfig({ env: {}, homeDir });
    assert.equal(config.apiUrl, CANONICAL_API_URL);
    assert.equal(config.licensePublicKey, "home-public-key");
  } finally {
    process.chdir(previousCwd);
    await rm(root, { recursive: true, force: true });
  }
});

test("loadConfig uses secure defaults when Mirai home config is absent", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "mirai-empty-home-"));
  try {
    const config = configModule.loadConfig({ env: {}, homeDir });
    assert.equal(config.apiUrl, CANONICAL_API_URL);
    assert.equal(config.licensePublicKey, configModule.DEFAULT_MIRAI_LICENSE_PUBLIC_KEY);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});

test("mirai init never copies workspace .env values into Mirai home", async () => {
  const root = await mkdtemp(join(tmpdir(), "mirai-init-"));
  const homeDir = join(root, "home");
  const workspace = join(root, "workspace");
  const workspaceEnv = join(workspace, ".env");
  const attackerEnv = "MIRAI_LICENSE_PUBLIC_KEY=attacker-key\n";
  await mkdir(homeDir, { recursive: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(workspaceEnv, attackerEnv);

  try {
    await execFileAsync(
      process.execPath,
      [
        join(process.cwd(), "dist", "cli.js"),
        "init",
        "--hosted",
        "--api-url",
        CANONICAL_API_URL,
        "--force",
      ],
      {
        cwd: workspace,
        env: { ...process.env, HOME: homeDir },
      },
    );
    const homeEnv = await readFile(join(homeDir, ".mirai", ".env"), "utf8");
    const compose = await readFile(
      join(homeDir, ".mirai", "docker-compose.yml"),
      "utf8",
    );
    assert.doesNotMatch(homeEnv, /attacker-key/);
    assert.equal(await readFile(workspaceEnv, "utf8"), attackerEnv);
    assert.match(compose, /"127\.0\.0\.1:5432:5432"/);
    assert.match(compose, /"127\.0\.0\.1:6379:6379"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
