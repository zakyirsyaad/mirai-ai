import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import * as cli from "../dist/cli.js";

const execFileAsync = promisify(execFile);

test("CLI routes help, config, infra, and hosted-only commands", async () => {
  assert.equal(typeof cli.main, "function");
  const originalLog = console.log;
  let output = [];
  console.log = (...args) => {
    output = [...output, args.join(" ")];
  };
  try {
    await cli.main("help", []);
    await cli.main("unknown", []);
    await cli.main("config", ["json"]);
    await cli.main("config", ["codex"]);
    await cli.main("config", ["hermes"]);
    await cli.main("config", ["local"]);
    await cli.main("infra", ["unknown"]);
    await cli.main("infra", ["up"]);
    await cli.main("worker", []);
    await cli.main("start", []);
  } finally {
    console.log = originalLog;
  }

  assert.ok(output.some((line) => line.includes("Usage:")));
  assert.ok(output.some((line) => line.includes("mcpServers")));
  assert.ok(output.some((line) => line.includes("hermes mcp add")));
  assert.ok(output.some((line) => line.includes("self-hosted development")));
});

test("CLI starts when npm invokes it through a bin symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "mirai-bin-"));
  const binPath = join(root, "mirai");
  await symlink(new URL("../dist/cli.js", import.meta.url), binPath);
  try {
    const { stdout } = await execFileAsync(process.execPath, [binPath, "help"]);
    assert.match(stdout, /Usage:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
