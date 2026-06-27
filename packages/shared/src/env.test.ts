import assert from "node:assert/strict";
import test from "node:test";
import { loadEnv, resetEnvCache } from "./env.js";

test("loadEnv parses Universal Workbench A2A configuration", () => {
  resetEnvCache();
  const env = loadEnv({
    CROO_A2A_WORKBENCH_SERVICE_ID: "workbench-service",
    CROO_A2A_WORKBENCH_AGENT_NAME: "Universal Workbench AI Agent",
  });

  assert.equal(env.CROO_A2A_WORKBENCH_SERVICE_ID, "workbench-service");
  assert.equal(
    env.CROO_A2A_WORKBENCH_AGENT_NAME,
    "Universal Workbench AI Agent",
  );
  resetEnvCache();
});

test("loadEnv treats blank Universal Workbench env values as absent", () => {
  resetEnvCache();
  const env = loadEnv({
    CROO_A2A_WORKBENCH_SERVICE_ID: "",
    CROO_A2A_WORKBENCH_AGENT_NAME: "",
  });

  assert.equal(env.CROO_A2A_WORKBENCH_SERVICE_ID, undefined);
  assert.equal(env.CROO_A2A_WORKBENCH_AGENT_NAME, undefined);
  resetEnvCache();
});

test("loadEnv parses OpenModel LLM configuration", () => {
  resetEnvCache();
  const env = loadEnv({
    LLM_PROVIDER: "openmodel",
    OPENMODEL_API_KEY: "test-openmodel-key",
    OPENMODEL_MODEL: "deepseek-v4-flash",
  });

  assert.equal(env.LLM_PROVIDER, "openmodel");
  assert.equal(env.OPENMODEL_API_KEY, "test-openmodel-key");
  assert.equal(env.OPENMODEL_BASE_URL, "https://api.openmodel.ai");
  assert.equal(env.OPENMODEL_MODEL, "deepseek-v4-flash");
  resetEnvCache();
});

test("loadEnv parses generic OpenAI-compatible AI configuration", () => {
  resetEnvCache();
  const env = loadEnv({
    LLM_PROVIDER: "ai",
    AI_API_KEY: "test-runtime-key",
    AI_BASE_URL: "https://api.badtheorylabs.com/v1",
    AI_MODEL: "btl-2",
    AI_TIMEOUT_MS: "45000",
  });

  assert.equal(env.LLM_PROVIDER, "ai");
  assert.equal(env.AI_API_KEY, "test-runtime-key");
  assert.equal(env.AI_BASE_URL, "https://api.badtheorylabs.com/v1");
  assert.equal(env.AI_MODEL, "btl-2");
  assert.equal(env.AI_TIMEOUT_MS, 45_000);
  resetEnvCache();
});
