import { loadEnv } from "@mirai/shared";
import { createXClient, type XClient } from "@mirai/x";
import { createLlm, type Llm } from "@mirai/content";

/**
 * Process-wide singletons for the X adapter and the LLM. Both fall back to
 * deterministic mocks when their credentials are absent, so the agent runs
 * end-to-end with zero external cost during development.
 */
const env = loadEnv();

export const xClient: XClient = createXClient(env);
export const llm: Llm = createLlm(env);

export function describeClients(): string {
  return `x=${xClient.mode} llm=${llm.kind}`;
}
