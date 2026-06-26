import test from "node:test";
import assert from "node:assert/strict";
import { loadEnv, resetEnvCache } from "@mirai/shared";
import { createLlm, MockLlm } from "./llm.js";

test("createLlm auto-selects OpenModel when its key is present", () => {
  resetEnvCache();
  const env = loadEnv({
    OPENMODEL_API_KEY: "test-openmodel-key",
    OPENMODEL_MODEL: "deepseek-v4-flash",
  });

  assert.equal(createLlm(env).kind, "openmodel");
  resetEnvCache();
});

test("createLlm requires an OpenModel key when explicitly selected", () => {
  resetEnvCache();
  const env = loadEnv({
    LLM_PROVIDER: "openmodel",
  });

  assert.throws(() => createLlm(env), /OPENMODEL_API_KEY/);
  resetEnvCache();
});

test("createLlm keeps deterministic mock mode available", () => {
  resetEnvCache();
  const env = loadEnv({
    LLM_PROVIDER: "mock",
  });

  assert.equal(createLlm(env).kind, "mock");
  resetEnvCache();
});

test("MockLlm reflects variant style when present", async () => {
  const llm = new MockLlm();
  const insight = await llm.complete({
    system: "tweet",
    prompt: "Angle for this post: agents\nVariant style: A concise insight.",
  });
  const story = await llm.complete({
    system: "tweet",
    prompt: "Angle for this post: agents\nVariant style: A compact mini-story.",
  });

  assert.notEqual(insight, story);
});
