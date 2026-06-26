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
