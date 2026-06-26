# Universal Workbench A2A Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real three-task Universal Workbench A2A orchestration flow for Mirai campaigns: `research-pack`, `creative-pack`, and `safety-pack`.

**Architecture:** Add `taskType` to A2A proof storage/reporting, then introduce a generic Universal Workbench request builder, lifecycle runner, and orchestrator. The orchestrator runs three paid CAP delegations sequentially, merges research/creative outputs into grounding signals, and lets safety output block unsafe posts before posting.

**Tech Stack:** TypeScript ESM, Node test runner, Prisma/Postgres, Zod, BullMQ pipeline, existing `@mirai/croo` SDK wrapper.

---

## File Structure

- Create `packages/shared/src/requirements.test.ts`
  Tests shared A2A proof schema accepts task types.
- Modify `packages/shared/src/requirements.ts`
  Adds public A2A task type constants and `taskType` to report schema.
- Modify `packages/shared/src/env.ts`
  Adds Universal Workbench env vars with old creative env vars retained.
- Create `packages/shared/src/env.test.ts`
  Tests env parsing for new workbench variables.
- Modify `packages/db/prisma/schema.prisma`
  Adds `taskType` to `A2ADelegation`.
- Create `packages/db/prisma/migrations/20260626120000_add_a2a_task_type/migration.sql`
  Adds the DB column and a partial unique index for task-scoped post delegations.
- Create `apps/agent/src/a2a/workbench-types.ts`
  Pure types, request builders, output merging, and safety verdict parsing.
- Create `apps/agent/src/a2a/workbench-types.unit.test.ts`
  Unit tests for three task request shapes and safety parsing.
- Create `apps/agent/src/a2a/universal-workbench.ts`
  Generic Universal Workbench CAP lifecycle runner with injectable store/client dependencies.
- Create `apps/agent/src/a2a/universal-workbench.integration.test.ts`
  Tests lifecycle order and resume behavior with in-memory store and fake CROO client.
- Create `apps/agent/src/a2a/workbench-orchestrator.ts`
  Runs research, creative, and safety sequentially.
- Create `apps/agent/src/a2a/workbench-orchestrator.unit.test.ts`
  Tests merge behavior and safety block behavior.
- Modify `apps/agent/src/a2a/creative-workbench.ts`
  Keep backward-compatible exports by delegating to the new orchestrator or request builder.
- Modify `apps/agent/src/stages/acquire.ts`
  Calls the new orchestrator and skips posts if safety returns `BLOCK`.
- Modify `apps/agent/src/stages/campaign.ts`
  Adds `taskType` to final A2A report entries.
- Modify `apps/agent/scripts/real-creative-a2a-e2e.mjs`
  Runs all three task types and prints redacted proof.
- Modify `README.md`
  Documents Universal Workbench multi-task A2A proof and env names.

---

### Task 1: Add A2A Task Type To Shared Schema And DB

**Files:**
- Create: `packages/shared/src/requirements.test.ts`
- Modify: `packages/shared/src/requirements.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260626120000_add_a2a_task_type/migration.sql`

- [ ] **Step 1: Write failing shared schema test**

Create `packages/shared/src/requirements.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  A2ADelegationProofSchema,
  A2ADelegationTaskType,
} from "./requirements.js";

test("A2A proof schema accepts Universal Workbench task types", () => {
  const parsed = A2ADelegationProofSchema.parse({
    taskType: A2ADelegationTaskType.ResearchPack,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: "negotiation-1",
    downstreamOrderId: "order-1",
    status: "COMPLETED",
    request: { taskType: "research-pack" },
    response: { delivery: { text: "research delivered" } },
    error: null,
    startedAt: new Date("2026-06-26T00:00:00.000Z").toISOString(),
    paidAt: new Date("2026-06-26T00:01:00.000Z").toISOString(),
    completedAt: new Date("2026-06-26T00:02:00.000Z").toISOString(),
  });

  assert.equal(parsed.taskType, "research-pack");
});

test("A2A proof schema keeps null taskType for legacy rows", () => {
  const parsed = A2ADelegationProofSchema.parse({
    taskType: null,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: null,
    downstreamOrderId: null,
    status: "FAILED",
    request: {},
    response: null,
    error: "failed before migration",
    startedAt: new Date("2026-06-26T00:00:00.000Z").toISOString(),
    paidAt: null,
    completedAt: null,
  });

  assert.equal(parsed.taskType, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mirai/shared test
```

Expected: FAIL with an export error for `A2ADelegationTaskType` or a Zod schema error because `taskType` is not accepted.

- [ ] **Step 3: Add shared task type constants and proof field**

Modify `packages/shared/src/requirements.ts` near the existing A2A proof schema:

```ts
export const A2ADelegationTaskType = {
  ResearchPack: "research-pack",
  CreativePack: "creative-pack",
  SafetyPack: "safety-pack",
} as const;
export type A2ADelegationTaskType =
  (typeof A2ADelegationTaskType)[keyof typeof A2ADelegationTaskType];

export const A2ADelegationTaskTypeSchema = z.enum([
  A2ADelegationTaskType.ResearchPack,
  A2ADelegationTaskType.CreativePack,
  A2ADelegationTaskType.SafetyPack,
]);
```

Then update `A2ADelegationProofSchema`:

```ts
export const A2ADelegationProofSchema = z.object({
  taskType: A2ADelegationTaskTypeSchema.nullable(),
  downstreamAgent: z.string().min(1),
  downstreamServiceId: z.string().min(1),
  downstreamNegotiationId: z.string().nullable(),
  downstreamOrderId: z.string().nullable(),
  status: z.enum([
    "NEGOTIATING",
    "ORDER_CREATED",
    "PAID",
    "COMPLETED",
    "FAILED",
  ]),
  request: z.unknown(),
  response: z.unknown().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
```

- [ ] **Step 4: Add Prisma field**

Modify `packages/db/prisma/schema.prisma` inside `model A2ADelegation`:

```prisma
  taskType                 String              @default("creative-pack")
```

Place it after `upstreamCrooOrderId String`.

Also add this index below the existing `@@index([scheduledPostId])` line:

```prisma
  @@index([scheduledPostId, downstreamServiceId, taskType])
```

- [ ] **Step 5: Add SQL migration**

Create `packages/db/prisma/migrations/20260626120000_add_a2a_task_type/migration.sql`:

```sql
ALTER TABLE "A2ADelegation"
ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'creative-pack';

CREATE INDEX "A2ADelegation_scheduledPostId_downstreamServiceId_taskType_idx"
ON "A2ADelegation"("scheduledPostId", "downstreamServiceId", "taskType");

CREATE UNIQUE INDEX "A2ADelegation_post_service_task_unique"
ON "A2ADelegation"("scheduledPostId", "downstreamServiceId", "taskType")
WHERE "scheduledPostId" IS NOT NULL;
```

- [ ] **Step 6: Regenerate Prisma client and run tests**

Run:

```bash
pnpm db:generate
pnpm --filter @mirai/shared test
pnpm --filter @mirai/db typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/requirements.ts packages/shared/src/requirements.test.ts packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260626120000_add_a2a_task_type/migration.sql
git commit -m "feat: add a2a delegation task type"
```

---

### Task 2: Add Universal Workbench Env Configuration

**Files:**
- Create: `packages/shared/src/env.test.ts`
- Modify: `packages/shared/src/env.ts`

- [ ] **Step 1: Write failing env test**

Create `packages/shared/src/env.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mirai/shared test
```

Expected: FAIL because `CROO_A2A_WORKBENCH_SERVICE_ID` and `CROO_A2A_WORKBENCH_AGENT_NAME` are not part of `Env`.

- [ ] **Step 3: Add env fields**

Modify `packages/shared/src/env.ts` in `EnvSchema`, after `CROO_A2A_CREATIVE_AGENT_NAME`:

```ts
  CROO_A2A_WORKBENCH_SERVICE_ID: optionalStr(),
  CROO_A2A_WORKBENCH_AGENT_NAME: optionalStr(),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @mirai/shared test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/env.ts packages/shared/src/env.test.ts
git commit -m "feat: add universal workbench env config"
```

---

### Task 3: Build Pure Universal Workbench Request And Merge Helpers

**Files:**
- Create: `apps/agent/src/a2a/workbench-types.ts`
- Create: `apps/agent/src/a2a/workbench-types.unit.test.ts`
- Modify: `apps/agent/src/a2a/creative-workbench.ts`
- Modify: `apps/agent/src/a2a/creative-workbench.unit.test.ts`
- Modify: `apps/agent/src/a2a/creative-workbench.integration.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/agent/src/a2a/workbench-types.unit.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  parseSafetyDecision,
  readResponseLanguage,
  type UniversalWorkbenchArgs,
} from "./workbench-types.js";

function baseArgs(
  taskType = A2ADelegationTaskType.ResearchPack,
): UniversalWorkbenchArgs {
  return {
    taskType,
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents", "content ops"],
    niche: "autonomous X content",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Users want durable creator-agent workflows.",
    },
    voiceProfile: {
      tone: "sharp",
      topics: ["AI agents"],
      styleNotes: ["specific"],
      doNots: ["no unsupported claims"],
    },
    contentPolicy: { language: "id" },
  };
}

test("buildUniversalWorkbenchRequest creates distinct research, creative, and safety tasks", () => {
  const research = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.ResearchPack),
  );
  const creative = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.CreativePack),
  );
  const safety = buildUniversalWorkbenchRequest(
    baseArgs(A2ADelegationTaskType.SafetyPack),
  );

  assert.equal(research.taskType, "research-pack");
  assert.equal(creative.taskType, "creative-pack");
  assert.equal(safety.taskType, "safety-pack");
  assert.match(research.prompt, /source\/context pack/i);
  assert.match(creative.prompt, /campaign angles/i);
  assert.match(safety.prompt, /PASS, WARN, or BLOCK/i);
  assert.equal(research.language, "id");
});

test("mergeWorkbenchOutputs keeps base signals and labels all completed work", () => {
  const merged = mergeWorkbenchOutputs(baseArgs().baseSignals, [
    {
      taskType: "research-pack",
      response: { delivery: { text: "Research pack delivered." } },
    },
    {
      taskType: "creative-pack",
      response: { delivery: { text: "Creative pack delivered." } },
    },
  ]);

  assert.deepEqual(merged.themes, [
    "creator workflow",
    "Universal Workbench research-pack",
    "Universal Workbench creative-pack",
  ]);
  assert.match(merged.note, /Universal Workbench research-pack delivery/);
  assert.match(merged.note, /Universal Workbench creative-pack delivery/);
});

test("parseSafetyDecision reads structured and unstructured safety output", () => {
  assert.deepEqual(parseSafetyDecision({ verdict: "BLOCK", reason: "URL risk" }), {
    verdict: "BLOCK",
    reason: "URL risk",
  });
  assert.deepEqual(parseSafetyDecision({ verdict: "PASS" }), {
    verdict: "PASS",
    reason: null,
  });
  assert.deepEqual(parseSafetyDecision("looks risky but not blocked"), {
    verdict: "WARN",
    reason: "looks risky but not blocked",
  });
});

test("readResponseLanguage defaults to English unless policy language is id", () => {
  assert.equal(readResponseLanguage({ language: "id" }), "id");
  assert.equal(readResponseLanguage({ language: "en" }), "en");
  assert.equal(readResponseLanguage(null), "en");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mirai/agent test:unit
```

Expected: FAIL because `workbench-types.js` does not exist.

- [ ] **Step 3: Create pure helper module**

Create `apps/agent/src/a2a/workbench-types.ts`:

```ts
import { A2ADelegationTaskType } from "@mirai/shared";
import type { GroundingSignals } from "@mirai/content";

export type UniversalWorkbenchTaskType = A2ADelegationTaskType;
export type SafetyVerdict = "PASS" | "WARN" | "BLOCK";

export interface UniversalWorkbenchArgs {
  taskType: UniversalWorkbenchTaskType;
  campaignId: string;
  scheduledPostId: string;
  upstreamCrooOrderId: string;
  topics: string[];
  niche: string | null;
  baseSignals: GroundingSignals;
  voiceProfile: {
    tone: string;
    topics: string[];
    styleNotes: string[];
    doNots: string[];
  } | null;
  contentPolicy: unknown;
}

export interface UniversalWorkbenchRequest {
  taskType: UniversalWorkbenchTaskType;
  prompt: string;
  packType: "creator-ops";
  track: "creator-content-ops";
  language: "en" | "id";
  context: {
    requester: "mirai-ai";
    purpose: string;
    campaign: {
      campaignId: string;
      scheduledPostId: string;
      upstreamCrooOrderId: string;
      niche: string | null;
      topics: string[];
    };
    voiceProfile: UniversalWorkbenchArgs["voiceProfile"];
    contentPolicy: unknown;
    baseSignals: GroundingSignals;
  };
  miraiTrace: {
    campaignId: string;
    scheduledPostId: string;
    upstreamCrooOrderId: string;
    taskType: UniversalWorkbenchTaskType;
  };
}

export interface WorkbenchOutput {
  taskType: UniversalWorkbenchTaskType;
  response: unknown;
}

export interface SafetyDecision {
  verdict: SafetyVerdict;
  reason: string | null;
}

export function buildUniversalWorkbenchRequest(
  args: UniversalWorkbenchArgs,
): UniversalWorkbenchRequest {
  return {
    taskType: args.taskType,
    prompt: buildPrompt(args),
    packType: "creator-ops",
    track: "creator-content-ops",
    language: readResponseLanguage(args.contentPolicy),
    context: {
      requester: "mirai-ai",
      purpose: purposeForTask(args.taskType),
      campaign: {
        campaignId: args.campaignId,
        scheduledPostId: args.scheduledPostId,
        upstreamCrooOrderId: args.upstreamCrooOrderId,
        niche: args.niche,
        topics: args.topics,
      },
      voiceProfile: args.voiceProfile,
      contentPolicy: args.contentPolicy,
      baseSignals: args.baseSignals,
    },
    miraiTrace: {
      campaignId: args.campaignId,
      scheduledPostId: args.scheduledPostId,
      upstreamCrooOrderId: args.upstreamCrooOrderId,
      taskType: args.taskType,
    },
  };
}

export function readResponseLanguage(contentPolicy: unknown): "en" | "id" {
  if (
    contentPolicy &&
    typeof contentPolicy === "object" &&
    "language" in contentPolicy &&
    contentPolicy.language === "id"
  ) {
    return "id";
  }
  return "en";
}

export function mergeWorkbenchOutputs(
  baseSignals: GroundingSignals,
  outputs: WorkbenchOutput[],
): GroundingSignals {
  return {
    themes: dedupe([
      ...baseSignals.themes,
      ...outputs.map((output) => `Universal Workbench ${output.taskType}`),
    ]),
    trends: baseSignals.trends,
    note: [
      baseSignals.note,
      ...outputs.map(
        (output) =>
          `Universal Workbench ${output.taskType} delivery:\n${stringifyBrief(
            output.response,
          ).slice(0, 2_000)}`,
      ),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function parseSafetyDecision(value: unknown): SafetyDecision {
  const candidate = unwrapDeliveryText(value);
  if (candidate && typeof candidate === "object" && "verdict" in candidate) {
    const verdict = normalizeVerdict(candidate.verdict);
    return {
      verdict,
      reason:
        "reason" in candidate && typeof candidate.reason === "string"
          ? candidate.reason
          : null,
    };
  }
  if (typeof candidate === "string") {
    const upper = candidate.toUpperCase();
    if (upper.includes("BLOCK")) return { verdict: "BLOCK", reason: candidate };
    if (upper.includes("PASS")) return { verdict: "PASS", reason: null };
    return { verdict: "WARN", reason: candidate };
  }
  return { verdict: "WARN", reason: stringifyBrief(value).slice(0, 500) };
}

function purposeForTask(taskType: UniversalWorkbenchTaskType): string {
  if (taskType === A2ADelegationTaskType.ResearchPack) {
    return "Mirai hires Universal Workbench to produce a source/context pack, audience signal summary, safe claim guidance, and unsupported-claim warnings for one X campaign post.";
  }
  if (taskType === A2ADelegationTaskType.CreativePack) {
    return "Mirai hires Universal Workbench to produce campaign angles, draft seeds, voice-fit notes, and creator-ops risks for one X campaign post.";
  }
  return "Mirai hires Universal Workbench to review policy risk, sensitive topics, unsupported claims, and produce a PASS, WARN, or BLOCK safety verdict for one X campaign post.";
}

function buildPrompt(args: UniversalWorkbenchArgs): string {
  const focus = dedupe([args.niche ?? "", ...args.topics]).join(", ");
  const signals = dedupe([
    ...args.baseSignals.themes,
    ...args.baseSignals.trends,
  ]).join(", ");
  const common = [
    "Create a Universal Workbench creator-ops deliverable for Mirai's X campaign.",
    `Task type: ${args.taskType}.`,
    focus ? `Campaign focus: ${focus}.` : "",
    signals ? `Current signals: ${signals}.` : "",
    args.baseSignals.note ? `Grounding note: ${args.baseSignals.note}` : "",
  ];
  if (args.taskType === A2ADelegationTaskType.ResearchPack) {
    return [
      ...common,
      "Return a concise source/context pack, audience signal summary, 3-5 safe claims, and claims to avoid.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (args.taskType === A2ADelegationTaskType.CreativePack) {
    return [
      ...common,
      "Return campaign angles, one recommended post direction, voice-fit notes, draft seeds, and risks to avoid.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    ...common,
    "Return a structured safety review with verdict PASS, WARN, or BLOCK, a short reason, and safer replacement guidance when needed.",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeVerdict(value: unknown): SafetyVerdict {
  if (value === "PASS" || value === "WARN" || value === "BLOCK") return value;
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "PASS" || upper === "WARN" || upper === "BLOCK") return upper;
  }
  return "WARN";
}

function unwrapDeliveryText(value: unknown): unknown {
  if (value && typeof value === "object" && "delivery" in value) {
    const delivery = value.delivery;
    if (delivery && typeof delivery === "object" && "text" in delivery) {
      return delivery.text;
    }
  }
  return value;
}

function stringifyBrief(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}
```

- [ ] **Step 4: Keep creative compatibility wrapper**

Modify `apps/agent/src/a2a/creative-workbench.ts` so existing exported pure helpers delegate to the new builder:

```ts
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  readResponseLanguage,
  type UniversalWorkbenchRequest,
} from "./workbench-types.js";
```

Update `CreativeWorkbenchRequest` type:

```ts
export type CreativeWorkbenchRequest = UniversalWorkbenchRequest;
```

Update `buildCreativeWorkbenchRequest`:

```ts
export function buildCreativeWorkbenchRequest(
  args: AcquireCreativeWorkbenchSignalsArgs,
): CreativeWorkbenchRequest {
  return buildUniversalWorkbenchRequest({
    ...args,
    taskType: A2ADelegationTaskType.CreativePack,
  });
}
```

Update `mergeSignals`:

```ts
export function mergeSignals(
  baseSignals: GroundingSignals,
  creativeResponse: unknown,
): GroundingSignals {
  return mergeWorkbenchOutputs(baseSignals, [
    {
      taskType: A2ADelegationTaskType.CreativePack,
      response: creativeResponse,
    },
  ]);
}
```

Keep the existing lifecycle code in `creative-workbench.ts` for now. Remove the old local `readResponseLanguage`, `buildCreativeTaskPrompt`, and duplicate `dedupe` only after tests pass and imports are clean.

- [ ] **Step 5: Update tests for new wording**

In `apps/agent/src/a2a/creative-workbench.unit.test.ts`, update the old assertion:

```ts
assert.match(request.prompt, /campaign angles/);
```

Replace:

```ts
assert.match(merged.note, /A2A creative workbench delivery/);
```

with:

```ts
assert.match(merged.note, /Universal Workbench creative-pack delivery/);
```

In `apps/agent/src/a2a/creative-workbench.integration.test.ts`, replace:

```ts
assert.match(merged.note, /creative workbench/);
```

with:

```ts
assert.match(merged.note, /Universal Workbench creative-pack/);
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @mirai/agent test:unit
pnpm --filter @mirai/agent test:integration
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/a2a/workbench-types.ts apps/agent/src/a2a/workbench-types.unit.test.ts apps/agent/src/a2a/creative-workbench.ts apps/agent/src/a2a/creative-workbench.unit.test.ts apps/agent/src/a2a/creative-workbench.integration.test.ts
git commit -m "feat: add universal workbench task builders"
```

---

### Task 4: Implement Generic Universal Workbench CAP Lifecycle Runner

**Files:**
- Create: `apps/agent/src/a2a/universal-workbench.ts`
- Create: `apps/agent/src/a2a/universal-workbench.integration.test.ts`

- [ ] **Step 1: Write failing lifecycle integration test**

Create `apps/agent/src/a2a/universal-workbench.integration.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationStatus } from "@mirai/db";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  runUniversalWorkbenchTask,
  type UniversalWorkbenchDelegation,
  type UniversalWorkbenchStore,
} from "./universal-workbench.js";
import type { UniversalWorkbenchArgs } from "./workbench-types.js";

function args(): UniversalWorkbenchArgs {
  return {
    taskType: A2ADelegationTaskType.ResearchPack,
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents"],
    niche: "creator ops",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Need context.",
    },
    voiceProfile: null,
    contentPolicy: { language: "en" },
  };
}

function memoryStore(): UniversalWorkbenchStore {
  let row: UniversalWorkbenchDelegation | null = null;
  return {
    async findCompleted() {
      return row?.status === A2ADelegationStatus.COMPLETED ? row : null;
    },
    async findLatest() {
      return row;
    },
    async create(input) {
      row = {
        id: "delegation-1",
        campaignId: input.campaignId,
        scheduledPostId: input.scheduledPostId,
        upstreamCrooOrderId: input.upstreamCrooOrderId,
        taskType: input.taskType,
        downstreamAgent: input.downstreamAgent,
        downstreamServiceId: input.downstreamServiceId,
        downstreamNegotiationId: null,
        downstreamOrderId: null,
        status: A2ADelegationStatus.NEGOTIATING,
        requestJson: input.requestJson,
        responseJson: null,
        error: null,
        paidAt: null,
        completedAt: null,
      };
      return row;
    },
    async update(id, data) {
      assert.equal(id, "delegation-1");
      row = { ...(row as UniversalWorkbenchDelegation), ...data };
      return row;
    },
  };
}

test("runUniversalWorkbenchTask negotiates, pays, polls, and stores task response", async () => {
  const calls: string[] = [];
  const result = await runUniversalWorkbenchTask(args(), {
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    store: memoryStore(),
    croo: {
      async negotiateOrder() {
        calls.push("negotiateOrder");
        return { negotiationId: "negotiation-1", status: "created" };
      },
      async findRequesterOrderByNegotiation() {
        calls.push("findRequesterOrderByNegotiation");
        return { orderId: "order-1", status: "created" };
      },
      async payOrder() {
        calls.push("payOrder");
        return { txHash: "0xpay", order: { orderId: "order-1", status: "paid" } };
      },
      async getOrder() {
        calls.push("getOrder");
        return { orderId: "order-1", status: "completed" };
      },
      async getDelivery() {
        calls.push("getDelivery");
        return {
          deliverableType: "schema",
          deliverableSchema: JSON.stringify({ verdict: "PASS" }),
          deliverableText: "",
          status: "accepted",
        };
      },
    },
    sleepMs: async () => {},
    now: () => new Date("2026-06-26T00:00:00.000Z"),
  });

  assert.deepEqual(calls, [
    "negotiateOrder",
    "findRequesterOrderByNegotiation",
    "payOrder",
    "getOrder",
    "getDelivery",
  ]);
  assert.equal(result.taskType, "research-pack");
  assert.equal(result.delegation.status, A2ADelegationStatus.COMPLETED);
});

test("runUniversalWorkbenchTask reuses completed task delegations", async () => {
  const completed: UniversalWorkbenchDelegation = {
    id: "delegation-1",
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    taskType: A2ADelegationTaskType.ResearchPack,
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    downstreamNegotiationId: "negotiation-1",
    downstreamOrderId: "order-1",
    status: A2ADelegationStatus.COMPLETED,
    requestJson: {},
    responseJson: { delivery: { text: "already done" } },
    error: null,
    paidAt: new Date("2026-06-26T00:00:00.000Z"),
    completedAt: new Date("2026-06-26T00:01:00.000Z"),
  };

  const result = await runUniversalWorkbenchTask(args(), {
    downstreamAgent: "Universal Workbench AI Agent",
    downstreamServiceId: "service-1",
    store: {
      async findCompleted() {
        return completed;
      },
      async findLatest() {
        return completed;
      },
      async create() {
        throw new Error("create should not run");
      },
      async update() {
        throw new Error("update should not run");
      },
    },
    croo: {
      async negotiateOrder() {
        throw new Error("negotiate should not run");
      },
      async findRequesterOrderByNegotiation() {
        throw new Error("find should not run");
      },
      async payOrder() {
        throw new Error("pay should not run");
      },
      async getOrder() {
        throw new Error("getOrder should not run");
      },
      async getDelivery() {
        throw new Error("getDelivery should not run");
      },
    },
    sleepMs: async () => {},
    now: () => new Date("2026-06-26T00:00:00.000Z"),
  });

  assert.equal(result.reused, true);
  assert.equal(result.response, completed.responseJson);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mirai/agent test:integration
```

Expected: FAIL because `universal-workbench.js` does not exist.

- [ ] **Step 3: Create lifecycle runner**

Create `apps/agent/src/a2a/universal-workbench.ts`:

```ts
import { setTimeout as sleep } from "node:timers/promises";
import { A2ADelegationStatus, Prisma, prisma } from "@mirai/db";
import { loadEnv, type A2ADelegationTaskType } from "@mirai/shared";
import {
  buildUniversalWorkbenchRequest,
  type UniversalWorkbenchArgs,
} from "./workbench-types.js";

const env = loadEnv();
const DEFAULT_DOWNSTREAM_AGENT = "Universal Workbench AI Agent";
const DEFAULT_WORKBENCH_SERVICE_ID = "a8f1c20d-73f4-4551-856a-32315e18d261";
const POLL_INTERVAL_MS = 5_000;
const ORDER_CREATED_TIMEOUT_MS = 5 * 60_000;
const DELIVERY_TIMEOUT_MS = 30 * 60_000;

export interface UniversalWorkbenchDelegation {
  id: string;
  campaignId: string;
  scheduledPostId: string | null;
  upstreamCrooOrderId: string;
  taskType: A2ADelegationTaskType;
  downstreamAgent: string;
  downstreamServiceId: string;
  downstreamNegotiationId: string | null;
  downstreamOrderId: string | null;
  status: A2ADelegationStatus;
  requestJson: unknown;
  responseJson: unknown | null;
  error: string | null;
  paidAt: Date | null;
  completedAt: Date | null;
}

export interface UniversalWorkbenchStore {
  findCompleted(args: {
    scheduledPostId: string;
    downstreamServiceId: string;
    taskType: A2ADelegationTaskType;
  }): Promise<UniversalWorkbenchDelegation | null>;
  findLatest(args: {
    scheduledPostId: string;
    downstreamServiceId: string;
    taskType: A2ADelegationTaskType;
  }): Promise<UniversalWorkbenchDelegation | null>;
  create(input: {
    campaignId: string;
    scheduledPostId: string;
    upstreamCrooOrderId: string;
    taskType: A2ADelegationTaskType;
    downstreamAgent: string;
    downstreamServiceId: string;
    requestJson: unknown;
  }): Promise<UniversalWorkbenchDelegation>;
  update(
    id: string,
    data: Partial<UniversalWorkbenchDelegation>,
  ): Promise<UniversalWorkbenchDelegation>;
}

export interface UniversalWorkbenchCrooClient {
  negotiateOrder(args: {
    serviceId: string;
    requirements: unknown;
    metadata?: unknown;
  }): Promise<{ negotiationId: string; status: string }>;
  findRequesterOrderByNegotiation(
    negotiationId: string,
  ): Promise<{ orderId: string; status: string } | null>;
  payOrder(orderId: string): Promise<{
    txHash: string;
    order: { orderId: string; status: string };
  }>;
  getOrder(orderId: string): Promise<{ orderId: string; status: string }>;
  getDelivery(orderId: string): Promise<{
    deliverableType: string;
    deliverableSchema: string;
    deliverableText: string;
    status: string;
  }>;
}

export interface RunUniversalWorkbenchTaskDeps {
  downstreamAgent: string;
  downstreamServiceId: string;
  store: UniversalWorkbenchStore;
  croo: UniversalWorkbenchCrooClient;
  sleepMs: (ms: number) => Promise<void>;
  now: () => Date;
}

export interface UniversalWorkbenchTaskResult {
  taskType: A2ADelegationTaskType;
  request: unknown;
  response: unknown;
  delegation: UniversalWorkbenchDelegation;
  reused: boolean;
}

export async function runUniversalWorkbenchTask(
  args: UniversalWorkbenchArgs,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchTaskResult> {
  const completed = await deps.store.findCompleted({
    scheduledPostId: args.scheduledPostId,
    downstreamServiceId: deps.downstreamServiceId,
    taskType: args.taskType,
  });
  if (completed) {
    return {
      taskType: args.taskType,
      request: completed.requestJson,
      response: completed.responseJson,
      delegation: completed,
      reused: true,
    };
  }

  const request = buildUniversalWorkbenchRequest(args);
  const latest = await deps.store.findLatest({
    scheduledPostId: args.scheduledPostId,
    downstreamServiceId: deps.downstreamServiceId,
    taskType: args.taskType,
  });
  const delegation =
    latest ??
    (await deps.store.create({
      campaignId: args.campaignId,
      scheduledPostId: args.scheduledPostId,
      upstreamCrooOrderId: args.upstreamCrooOrderId,
      taskType: args.taskType,
      downstreamAgent: deps.downstreamAgent,
      downstreamServiceId: deps.downstreamServiceId,
      requestJson: request,
    }));

  try {
    const withNegotiation = delegation.downstreamNegotiationId
      ? delegation
      : await negotiate(delegation, request, deps);
    const withOrder = withNegotiation.downstreamOrderId
      ? withNegotiation
      : await waitForCreatedOrder(withNegotiation, deps);
    const withPayment = withOrder.paidAt
      ? withOrder
      : await payDownstreamOrder(withOrder, deps);
    const delivery = normalizeDelivery(
      await waitForDelivery(withPayment.downstreamOrderId as string, deps),
    );
    const response = { universalWorkbenchRequest: request, delivery };
    const completedDelegation = await deps.store.update(withPayment.id, {
      status: A2ADelegationStatus.COMPLETED,
      responseJson: response,
      error: null,
      completedAt: deps.now(),
    });

    return {
      taskType: args.taskType,
      request,
      response,
      delegation: completedDelegation,
      reused: false,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Universal Workbench delegation failed";
    await deps.store.update(delegation.id, {
      status:
        err instanceof PollTimeoutError
          ? delegation.status
          : A2ADelegationStatus.FAILED,
      error: message,
    });
    throw err;
  }
}

export async function runUniversalWorkbenchTaskWithDefaults(
  args: UniversalWorkbenchArgs,
): Promise<UniversalWorkbenchTaskResult> {
  const downstream = resolveUniversalWorkbenchConfig();
  if (!env.CROO_SDK_KEY || !downstream.downstreamServiceId) {
    throw new Error(
      "Real A2A requires CROO_SDK_KEY and a Universal Workbench service ID.",
    );
  }
  const { crooClient } = await import("../croo.js");
  return runUniversalWorkbenchTask(args, {
    ...downstream,
    store: prismaUniversalWorkbenchStore,
    croo: crooClient(),
    sleepMs: sleep,
    now: () => new Date(),
  });
}

export function resolveUniversalWorkbenchConfig(): {
  downstreamAgent: string;
  downstreamServiceId: string;
} {
  return {
    downstreamAgent:
      env.CROO_A2A_WORKBENCH_AGENT_NAME ??
      env.CROO_A2A_CREATIVE_AGENT_NAME ??
      DEFAULT_DOWNSTREAM_AGENT,
    downstreamServiceId:
      env.CROO_A2A_WORKBENCH_SERVICE_ID ??
      env.CROO_A2A_CREATIVE_SERVICE_ID ??
      DEFAULT_WORKBENCH_SERVICE_ID,
  };
}

const prismaUniversalWorkbenchStore: UniversalWorkbenchStore = {
  async findCompleted(args) {
    return prisma.a2ADelegation.findFirst({
      where: {
        scheduledPostId: args.scheduledPostId,
        downstreamServiceId: args.downstreamServiceId,
        taskType: args.taskType,
        status: A2ADelegationStatus.COMPLETED,
      },
      orderBy: { createdAt: "asc" },
    }) as Promise<UniversalWorkbenchDelegation | null>;
  },
  async findLatest(args) {
    return prisma.a2ADelegation.findFirst({
      where: {
        scheduledPostId: args.scheduledPostId,
        downstreamServiceId: args.downstreamServiceId,
        taskType: args.taskType,
      },
      orderBy: { createdAt: "desc" },
    }) as Promise<UniversalWorkbenchDelegation | null>;
  },
  async create(input) {
    return prisma.a2ADelegation.create({
      data: {
        campaignId: input.campaignId,
        scheduledPostId: input.scheduledPostId,
        upstreamCrooOrderId: input.upstreamCrooOrderId,
        taskType: input.taskType,
        downstreamAgent: input.downstreamAgent,
        downstreamServiceId: input.downstreamServiceId,
        requestJson: toJson(input.requestJson),
      },
    }) as Promise<UniversalWorkbenchDelegation>;
  },
  async update(id, data) {
    return prisma.a2ADelegation.update({
      where: { id },
      data: toPrismaUpdate(data),
    }) as Promise<UniversalWorkbenchDelegation>;
  },
};

async function negotiate(
  delegation: UniversalWorkbenchDelegation,
  request: unknown,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  const negotiation = await deps.croo.negotiateOrder({
    serviceId: deps.downstreamServiceId,
    requirements: request,
    metadata: {
      requester: "mirai-ai",
      kind: "a2a-delegation",
      downstreamAgent: deps.downstreamAgent,
      taskType: delegation.taskType,
    },
  });
  return deps.store.update(delegation.id, {
    downstreamNegotiationId: negotiation.negotiationId,
    status: A2ADelegationStatus.NEGOTIATING,
    error: null,
  });
}

async function waitForCreatedOrder(
  delegation: UniversalWorkbenchDelegation,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < ORDER_CREATED_TIMEOUT_MS) {
    const order = await deps.croo.findRequesterOrderByNegotiation(
      delegation.downstreamNegotiationId as string,
    );
    if (order) {
      return deps.store.update(delegation.id, {
        downstreamOrderId: order.orderId,
        status: A2ADelegationStatus.ORDER_CREATED,
        error: null,
      });
    }
    await deps.sleepMs(POLL_INTERVAL_MS);
  }
  throw new PollTimeoutError(
    `Timed out waiting for downstream order creation for negotiation ${delegation.downstreamNegotiationId}.`,
  );
}

async function payDownstreamOrder(
  delegation: UniversalWorkbenchDelegation,
  deps: RunUniversalWorkbenchTaskDeps,
): Promise<UniversalWorkbenchDelegation> {
  await deps.croo.payOrder(delegation.downstreamOrderId as string);
  return deps.store.update(delegation.id, {
    status: A2ADelegationStatus.PAID,
    error: null,
    paidAt: deps.now(),
  });
}

async function waitForDelivery(
  downstreamOrderId: string,
  deps: RunUniversalWorkbenchTaskDeps,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DELIVERY_TIMEOUT_MS) {
    const order = await deps.croo.getOrder(downstreamOrderId);
    if (order.status === "completed") {
      return deps.croo.getDelivery(downstreamOrderId);
    }
    if (isTerminalFailure(order.status)) {
      throw new Error(
        `Downstream order ${downstreamOrderId} ended with status ${order.status}.`,
      );
    }
    await deps.sleepMs(POLL_INTERVAL_MS);
  }
  throw new PollTimeoutError(
    `Timed out waiting for downstream delivery for order ${downstreamOrderId}.`,
  );
}

function isTerminalFailure(status: string): boolean {
  return [
    "rejected",
    "expired",
    "create_failed",
    "pay_failed",
    "deliver_failed",
  ].includes(status);
}

function normalizeDelivery(delivery: {
  deliverableType: string;
  deliverableSchema: string;
  deliverableText: string;
  status: string;
}): unknown {
  return {
    deliverableType: delivery.deliverableType,
    status: delivery.status,
    schema: parseMaybeJson(delivery.deliverableSchema),
    text: parseMaybeJson(delivery.deliverableText),
  };
}

function parseMaybeJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaUpdate(
  data: Partial<UniversalWorkbenchDelegation>,
): Prisma.A2ADelegationUpdateInput {
  const update: Prisma.A2ADelegationUpdateInput = { ...data };
  if (data.requestJson !== undefined) update.requestJson = toJson(data.requestJson);
  if (data.responseJson !== undefined) {
    update.responseJson =
      data.responseJson === null ? Prisma.DbNull : toJson(data.responseJson);
  }
  return update;
}

class PollTimeoutError extends Error {}
```

- [ ] **Step 4: Run integration test**

Run:

```bash
pnpm --filter @mirai/agent test:integration
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/a2a/universal-workbench.ts apps/agent/src/a2a/universal-workbench.integration.test.ts
git commit -m "feat: add universal workbench cap lifecycle"
```

---

### Task 5: Add Three-Task Workbench Orchestrator And Wire ACQUIRE

**Files:**
- Create: `apps/agent/src/a2a/workbench-orchestrator.ts`
- Create: `apps/agent/src/a2a/workbench-orchestrator.unit.test.ts`
- Modify: `apps/agent/src/stages/acquire.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `apps/agent/src/a2a/workbench-orchestrator.unit.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { A2ADelegationTaskType } from "@mirai/shared";
import {
  orchestrateUniversalWorkbench,
  type WorkbenchTaskRunner,
} from "./workbench-orchestrator.js";
import type { UniversalWorkbenchArgs } from "./workbench-types.js";

function baseArgs(): Omit<UniversalWorkbenchArgs, "taskType"> {
  return {
    campaignId: "campaign-1",
    scheduledPostId: "post-1",
    upstreamCrooOrderId: "order-1",
    topics: ["AI creator agents"],
    niche: "creator ops",
    baseSignals: {
      themes: ["creator workflow"],
      trends: ["AI agents"],
      note: "Need campaign help.",
    },
    voiceProfile: null,
    contentPolicy: { language: "en" },
  };
}

test("orchestrateUniversalWorkbench runs research, creative, and safety in order", async () => {
  const calls: string[] = [];
  const runner: WorkbenchTaskRunner = async (args) => {
    calls.push(args.taskType);
    return {
      taskType: args.taskType,
      request: { taskType: args.taskType },
      response:
        args.taskType === A2ADelegationTaskType.SafetyPack
          ? { delivery: { text: { verdict: "PASS" } } }
          : { delivery: { text: `${args.taskType} delivered` } },
      delegation: {
        id: `${args.taskType}-delegation`,
        campaignId: args.campaignId,
        scheduledPostId: args.scheduledPostId,
        upstreamCrooOrderId: args.upstreamCrooOrderId,
        taskType: args.taskType,
        downstreamAgent: "Universal Workbench AI Agent",
        downstreamServiceId: "service-1",
        downstreamNegotiationId: "negotiation-1",
        downstreamOrderId: "order-1",
        status: "COMPLETED" as never,
        requestJson: {},
        responseJson: {},
        error: null,
        paidAt: null,
        completedAt: null,
      },
      reused: false,
    };
  };

  const result = await orchestrateUniversalWorkbench(baseArgs(), runner);

  assert.deepEqual(calls, [
    "research-pack",
    "creative-pack",
    "safety-pack",
  ]);
  assert.equal(result.safety.verdict, "PASS");
  assert.match(result.signals.note, /research-pack delivered/);
  assert.match(result.signals.note, /creative-pack delivered/);
});

test("orchestrateUniversalWorkbench returns BLOCK safety decisions", async () => {
  const runner: WorkbenchTaskRunner = async (args) => ({
    taskType: args.taskType,
    request: {},
    response:
      args.taskType === A2ADelegationTaskType.SafetyPack
        ? { delivery: { text: { verdict: "BLOCK", reason: "unsafe claim" } } }
        : { delivery: { text: "ok" } },
    delegation: {} as never,
    reused: false,
  });

  const result = await orchestrateUniversalWorkbench(baseArgs(), runner);

  assert.deepEqual(result.safety, {
    verdict: "BLOCK",
    reason: "unsafe claim",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mirai/agent test:unit
```

Expected: FAIL because `workbench-orchestrator.js` does not exist.

- [ ] **Step 3: Create orchestrator**

Create `apps/agent/src/a2a/workbench-orchestrator.ts`:

```ts
import { A2ADelegationTaskType } from "@mirai/shared";
import type { GroundingSignals } from "@mirai/content";
import {
  mergeWorkbenchOutputs,
  parseSafetyDecision,
  type SafetyDecision,
  type UniversalWorkbenchArgs,
  type WorkbenchOutput,
} from "./workbench-types.js";
import {
  runUniversalWorkbenchTaskWithDefaults,
  type UniversalWorkbenchTaskResult,
} from "./universal-workbench.js";

export type WorkbenchTaskRunner = (
  args: UniversalWorkbenchArgs,
) => Promise<UniversalWorkbenchTaskResult>;

export interface WorkbenchOrchestrationResult {
  signals: GroundingSignals;
  safety: SafetyDecision;
  outputs: WorkbenchOutput[];
}

export async function orchestrateUniversalWorkbench(
  args: Omit<UniversalWorkbenchArgs, "taskType">,
  runner: WorkbenchTaskRunner = runUniversalWorkbenchTaskWithDefaults,
): Promise<WorkbenchOrchestrationResult> {
  const research = await runner({
    ...args,
    taskType: A2ADelegationTaskType.ResearchPack,
  });
  const creative = await runner({
    ...args,
    taskType: A2ADelegationTaskType.CreativePack,
  });
  const safety = await runner({
    ...args,
    taskType: A2ADelegationTaskType.SafetyPack,
  });

  const outputs: WorkbenchOutput[] = [
    { taskType: research.taskType, response: research.response },
    { taskType: creative.taskType, response: creative.response },
    { taskType: safety.taskType, response: safety.response },
  ];

  return {
    signals: mergeWorkbenchOutputs(args.baseSignals, outputs),
    safety: parseSafetyDecision(safety.response),
    outputs,
  };
}
```

- [ ] **Step 4: Wire `ACQUIRE`**

Modify `apps/agent/src/stages/acquire.ts`.

Replace:

```ts
import { acquireCreativeWorkbenchSignals } from "../a2a/creative-workbench.js";
```

with:

```ts
import { orchestrateUniversalWorkbench } from "../a2a/workbench-orchestrator.js";
```

Replace the `const signals = shouldUseCreativeWorkbenchDelegation(...) ? ... : baseSignals;` block with:

```ts
    let signals = baseSignals;
    if (
      shouldUseCreativeWorkbenchDelegation({
        topics,
        niche: campaign.voiceProfile?.niche ?? null,
        policy,
        baseSignals,
      })
    ) {
      const orchestration = await orchestrateUniversalWorkbench({
        campaignId,
        scheduledPostId,
        upstreamCrooOrderId: campaign.order.crooOrderId,
        topics,
        niche: campaign.voiceProfile?.niche ?? null,
        baseSignals,
        voiceProfile: campaign.voiceProfile
          ? {
              tone: campaign.voiceProfile.tone,
              topics: campaign.voiceProfile.topics,
              styleNotes: campaign.voiceProfile.styleNotes,
              doNots: campaign.voiceProfile.doNots,
            }
          : null,
        contentPolicy: policy,
      });
      if (orchestration.safety.verdict === "BLOCK") {
        await prisma.scheduledPost.update({
          where: { id: scheduledPostId },
          data: {
            stage: PostStage.SKIPPED,
            failureReason:
              orchestration.safety.reason ??
              "Universal Workbench safety review blocked this post.",
          },
        });
        await publishEvent({
          type: "progress",
          campaignId,
          scheduledPostId,
          stage: Stage.Acquire,
          status: "skipped",
          message:
            orchestration.safety.reason ??
            "Universal Workbench safety review blocked this post.",
          at: now(),
        });
        return;
      }
      signals = orchestration.signals;
    }
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @mirai/agent test:unit
pnpm --filter @mirai/agent typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/a2a/workbench-orchestrator.ts apps/agent/src/a2a/workbench-orchestrator.unit.test.ts apps/agent/src/stages/acquire.ts
git commit -m "feat: orchestrate universal workbench a2a tasks"
```

---

### Task 6: Add Task Type To Final Reports

**Files:**
- Modify: `apps/agent/src/stages/campaign.ts`
- Modify: `apps/agent/src/hosted-tools.ts` if `hostedGetReport` separately maps A2A delegations
- Modify: `apps/agent/src/entitlement-server.e2e.test.ts` if report fixtures assert exact A2A shape

- [ ] **Step 1: Search report mapping**

Run:

```bash
rg -n "a2aDelegations|A2ADelegationProof|redactA2ASecrets" apps/agent/src packages/shared/src
```

Expected: identify all report serializers that need `taskType`.

- [ ] **Step 2: Add taskType in campaign report**

Modify `apps/agent/src/stages/campaign.ts` in the `a2aDelegations` map:

```ts
    a2aDelegations: campaign.a2aDelegations.map((delegation) => ({
      taskType: delegation.taskType,
      downstreamAgent: delegation.downstreamAgent,
      downstreamServiceId: delegation.downstreamServiceId,
      downstreamNegotiationId: delegation.downstreamNegotiationId,
      downstreamOrderId: delegation.downstreamOrderId,
      status: delegation.status,
      request: delegation.requestJson,
      response: redactA2ASecrets(delegation.responseJson ?? null),
      error: delegation.error,
      startedAt: delegation.startedAt.toISOString(),
      paidAt: delegation.paidAt?.toISOString() ?? null,
      completedAt: delegation.completedAt?.toISOString() ?? null,
    })),
```

- [ ] **Step 3: Add taskType in hosted report mapping if present**

If `apps/agent/src/hosted-tools.ts` maps `campaign.a2aDelegations`, use the same object shape as Step 2. If it only returns already-built report data, make no change.

- [ ] **Step 4: Run report-related tests**

Run:

```bash
pnpm --filter @mirai/agent test:e2e
pnpm --filter @mirai/agent test:api
pnpm --filter @mirai/agent typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/stages/campaign.ts apps/agent/src/hosted-tools.ts apps/agent/src/entitlement-server.e2e.test.ts
git commit -m "feat: include a2a task type in reports"
```

If `hosted-tools.ts` and `entitlement-server.e2e.test.ts` are unchanged, omit them from `git add`.

---

### Task 7: Extend Paid Real A2A E2E Script To Three Tasks

**Files:**
- Modify: `apps/agent/scripts/real-creative-a2a-e2e.mjs`
- Modify: `apps/agent/package.json` only if script name changes
- Modify: `package.json` only if root script name changes

- [ ] **Step 1: Build before editing script**

Run:

```bash
pnpm --filter @mirai/agent build
```

Expected: PASS and compiled files available under `apps/agent/dist`.

- [ ] **Step 2: Update script imports**

Modify `apps/agent/scripts/real-creative-a2a-e2e.mjs`.

Replace:

```js
import {
  buildCreativeWorkbenchRequest,
  mergeSignals,
} from "../dist/a2a/creative-workbench.js";
```

with:

```js
import {
  buildUniversalWorkbenchRequest,
  mergeWorkbenchOutputs,
  parseSafetyDecision,
} from "../dist/a2a/workbench-types.js";
```

- [ ] **Step 3: Resolve workbench env names**

Replace the service and agent env resolution with:

```js
const serviceId =
  env.CROO_A2A_WORKBENCH_SERVICE_ID ??
  env.CROO_A2A_CREATIVE_SERVICE_ID ??
  DEFAULT_CREATIVE_SERVICE_ID;
const agentId =
  process.env.CROO_A2A_WORKBENCH_AGENT_ID ??
  process.env.CROO_A2A_CREATIVE_AGENT_ID ??
  DEFAULT_CREATIVE_AGENT_ID;
const downstreamAgent =
  env.CROO_A2A_WORKBENCH_AGENT_NAME ??
  env.CROO_A2A_CREATIVE_AGENT_NAME ??
  "Universal Workbench AI Agent";
```

- [ ] **Step 4: Replace single request with three task requests**

Replace the single `const request = buildCreativeWorkbenchRequest(...)` and single negotiate/pay block with:

```js
const taskTypes = ["research-pack", "creative-pack", "safety-pack"];
const taskProofs = [];

for (const taskType of taskTypes) {
  const request = buildUniversalWorkbenchRequest({
    taskType,
    campaignId: "real-universal-workbench-a2a-e2e",
    scheduledPostId: `real-universal-workbench-a2a-e2e-${taskType}-${Date.now()}`,
    upstreamCrooOrderId: "manual-paid-e2e",
    topics: ["AI creator agents", "content ops", "X campaign copy"],
    niche: "autonomous X content",
    baseSignals,
    voiceProfile: {
      tone: "clear and evidence-led",
      topics: ["AI agents", "creator workflows"],
      styleNotes: ["specific", "concise"],
      doNots: ["no unsupported predictions"],
    },
    contentPolicy: { language: "id" },
  });

  const taskProof = { taskType, request };
  const negotiation = await client.negotiateOrder({
    serviceId,
    requirements: request,
    metadata: {
      requester: "mirai-ai",
      kind: "paid-real-a2a-e2e",
      downstreamAgent,
      taskType,
    },
  });
  taskProof.negotiationId = negotiation.negotiationId;
  taskProof.steps = [{ step: "negotiateOrder", status: negotiation.status }];

  const createdOrder = await waitForPayableOrder(negotiation.negotiationId);
  taskProof.downstreamOrderId = createdOrder.orderId;
  taskProof.steps.push({ step: "orderCreated", status: createdOrder.status });

  const payment = await client.payOrder(createdOrder.orderId);
  taskProof.payTxHash = payment.txHash;
  taskProof.steps.push({ step: "payOrder", status: payment.order.status });

  const completedOrder = await waitForDeliveryReady(createdOrder.orderId);
  taskProof.completedOrder = completedOrder;
  taskProof.steps.push({ step: "deliveryReady", status: completedOrder.status });

  const delivery = normalizeDelivery(await client.getDelivery(createdOrder.orderId));
  taskProof.delivery = delivery;
  taskProof.steps.push({ step: "getDelivery", status: "ok" });
  taskProofs.push(taskProof);
}

proof.tasks = taskProofs;
proof.mergedSignals = mergeWorkbenchOutputs(
  baseSignals,
  taskProofs.map((task) => ({
    taskType: task.taskType,
    response: { delivery: task.delivery },
  })),
);
proof.safetyDecision = parseSafetyDecision({
  delivery: taskProofs.find((task) => task.taskType === "safety-pack")?.delivery,
});
```

- [ ] **Step 5: Run script in no-key mode to verify failure is explicit**

Run without real payment credentials:

```bash
env -u CROO_SDK_KEY pnpm test:e2e:real-a2a
```

Expected: FAIL with `CROO_SDK_KEY is required for paid CROO A2A E2E.`

- [ ] **Step 6: Run type/build checks**

Run:

```bash
pnpm --filter @mirai/agent build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/scripts/real-creative-a2a-e2e.mjs
git commit -m "feat: run three-task paid workbench a2a e2e"
```

---

### Task 8: Update README Hackathon Proof Narrative

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update env section**

In `README.md`, replace the old CROO A2A env block:

```bash
CROO_A2A_CREATIVE_SERVICE_ID=a8f1c20d-73f4-4551-856a-32315e18d261
CROO_A2A_CREATIVE_AGENT_NAME=Universal Workbench AI Agent
```

with:

```bash
CROO_A2A_WORKBENCH_SERVICE_ID=a8f1c20d-73f4-4551-856a-32315e18d261
CROO_A2A_WORKBENCH_AGENT_NAME=Universal Workbench AI Agent
```

Add one sentence below it:

```md
`CROO_A2A_CREATIVE_SERVICE_ID` and `CROO_A2A_CREATIVE_AGENT_NAME` remain supported as backward-compatible aliases.
```

- [ ] **Step 2: Update Real A2A Handoff description**

Replace the one-order description with:

```md
Autonomous campaigns can hire Universal Workbench for three paid downstream CAP work orders:

```text
Mirai Content Agent -> Universal Workbench: research-pack
Mirai Content Agent -> Universal Workbench: creative-pack
Mirai Content Agent -> Universal Workbench: safety-pack
```

Mirai does not claim these are three different counterparties. The hackathon value is A2A depth: one downstream workbench performs three distinct paid tasks, and Mirai stores each task's negotiation ID, order ID, payment state, delivery, and redacted response in `a2aDelegations[]`.
```

- [ ] **Step 3: Add demo proof shape**

Add this under the real paid A2A proof section:

```md
The three-task E2E output is redacted JSON with this shape:

```json
{
  "downstreamAgent": "Universal Workbench AI Agent",
  "downstreamServiceId": "a8f1c20d-73f4-4551-856a-32315e18d261",
  "tasks": [
    { "taskType": "research-pack", "downstreamOrderId": "...", "payTxHash": "..." },
    { "taskType": "creative-pack", "downstreamOrderId": "...", "payTxHash": "..." },
    { "taskType": "safety-pack", "downstreamOrderId": "...", "payTxHash": "..." }
  ],
  "safetyDecision": { "verdict": "PASS", "reason": null }
}
```
```

- [ ] **Step 4: Run docs-adjacent verification**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe three-task workbench a2a proof"
```

---

### Task 9: Full Verification

**Files:**
- No new source files. This task verifies the branch.

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS across all packages.

- [ ] **Step 2: Run unit/integration/API/E2E tests**

```bash
pnpm test
pnpm test:integration
pnpm test:api
pnpm test:e2e
```

Expected: PASS.

- [ ] **Step 3: Run build**

```bash
pnpm build
```

Expected: PASS, including `@mirai/site` Next.js build.

- [ ] **Step 4: Run security checks**

```bash
pnpm test:security
```

Expected: PASS with no known vulnerabilities and secret scan `ok: true`.

- [ ] **Step 5: Optional paid proof run**

Only run this with explicit user approval because it can pay USDC:

```bash
MAX_APPROVED_MICRO_USDC=10000 pnpm test:e2e:real-a2a
```

Expected: PASS with redacted JSON showing `research-pack`, `creative-pack`, and `safety-pack` downstream orders.

- [ ] **Step 6: Review final diff**

```bash
git diff --stat HEAD~8..HEAD
git log --oneline -8
```

Expected: commits show schema/env/helpers/lifecycle/orchestrator/report/e2e/docs in separate focused changes.

---

## Self-Review

Spec coverage:

- Three Universal Workbench task types are implemented by Tasks 1, 3, 4, and 5.
- One service ID with backward-compatible creative env aliases is implemented by Task 2 and Task 7.
- `taskType` storage and report proof are implemented by Tasks 1 and 6.
- Sequential orchestration and safety `BLOCK` handling are implemented by Task 5.
- Manual paid E2E proof is implemented by Task 7.
- README hackathon narrative is implemented by Task 8.

Type consistency:

- Shared task type values are hyphenated strings: `research-pack`, `creative-pack`, `safety-pack`.
- Prisma stores `taskType` as `String` with default `creative-pack`.
- Report schema allows `taskType` to be one of the shared task type values or `null` for legacy report rows.

Execution risk:

- The Prisma partial unique index is manually created in SQL because Prisma schema does not model partial unique indexes directly.
- Paid E2E must not be run without explicit user approval because it can spend USDC.
