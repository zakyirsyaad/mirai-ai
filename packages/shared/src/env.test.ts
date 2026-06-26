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
