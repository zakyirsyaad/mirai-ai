# Universal Workbench A2A Orchestration Design

## Goal

Increase Mirai's CROO hackathon A2A score by turning the existing single Universal Workbench delegation into a traceable multi-task A2A orchestration flow.

Mirai remains the buyer-facing CROO Provider. Universal Workbench remains the single downstream CROO counterparty. Mirai hires Universal Workbench for three distinct work orders during campaign fulfillment:

1. `research-pack`: source/context pack, audience signal summary, and safe claim guidance.
2. `creative-pack`: campaign angles, draft seeds, and voice-fit notes.
3. `safety-pack`: policy risk review, unsupported-claim warnings, and pass/warn/block guidance.

This intentionally prioritizes A2A depth and proof quality over counterparty diversity.

## Hackathon Positioning

Submission sentence:

> A CROO buyer pays Mirai to run an autonomous X campaign; Mirai then hires Universal Workbench through paid CAP orders for research, creative direction, and safety review, merges those downstream deliverables into its posting pipeline, and returns a traceable proof report with upstream and downstream order IDs.

Track fit:

- Primary: Creator & Content Ops Agents.
- Secondary: Open - Any A2A Agents.

Expected scoring lift:

- A2A Composability: from roughly 17/25 to 21-22/25.
- Total score: from roughly 78/100 to 88-92/100 before demo/order-count polish.
- Further lift requires 10+ real CAP orders and a clear demo video.

## Architecture

Add a generic Universal Workbench orchestration layer under `apps/agent/src/a2a/`.

Proposed files:

- `apps/agent/src/a2a/workbench-types.ts`
  Defines task types, request shape, normalized response shape, and merge contract.
- `apps/agent/src/a2a/universal-workbench.ts`
  Owns Universal Workbench CAP order lifecycle: build request, negotiate, find order, pay, poll delivery, persist `A2ADelegation`, and merge output.
- `apps/agent/src/a2a/workbench-orchestrator.ts`
  Runs the selected task sequence for a scheduled post and returns enriched grounding signals plus safety guidance.
- Existing `apps/agent/src/a2a/creative-workbench.ts`
  Can be folded into the new Universal Workbench module or kept as a compatibility wrapper while implementation migrates.

Existing DB table `A2ADelegation` is mostly sufficient. To make reports clearer, add a new optional `taskType` field:

```prisma
taskType String?
```

This allows final reports to show which downstream order produced research, creative, or safety output without inferring from JSON.

## Configuration

Use one downstream service ID, not three service IDs:

```env
CROO_A2A_WORKBENCH_SERVICE_ID=a8f1c20d-73f4-4551-856a-32315e18d261
CROO_A2A_WORKBENCH_AGENT_NAME=Universal Workbench AI Agent
```

Keep the old names as backward-compatible fallbacks during migration:

```env
CROO_A2A_CREATIVE_SERVICE_ID=
CROO_A2A_CREATIVE_AGENT_NAME=
```

Resolution order:

1. `CROO_A2A_WORKBENCH_SERVICE_ID`
2. `CROO_A2A_CREATIVE_SERVICE_ID`
3. Existing hardcoded Universal Workbench default

## Data Flow

For each eligible autonomous scheduled post:

1. `ACQUIRE` gathers base X/niche signals.
2. `workbench-orchestrator` checks whether CROO A2A is enabled.
3. Mirai creates or reuses a campaign/post-scoped `research-pack` delegation.
4. Mirai creates or reuses a campaign/post-scoped `creative-pack` delegation.
5. Mirai creates or reuses a campaign/post-scoped `safety-pack` delegation.
6. Successful downstream deliveries are merged into `rawMaterial.signals.note`.
7. Safety guidance is passed into the existing deterministic `review()` path by adding warning context to the draft's grounding note.
8. `mirai_get_report` includes all downstream proof rows grouped by `taskType`.

The initial implementation should run these tasks sequentially to reduce payment/polling complexity and make demo logs easy to read.

## Idempotency

Each delegation is unique by:

```text
scheduledPostId + downstreamServiceId + taskType
```

If a task already has a completed delegation, Mirai reuses it. If it has a paid but incomplete delegation, Mirai resumes polling. If it failed, the next retry may create a new delegation only if the previous error is terminal and no downstream order was paid.

## Failure Handling

Missing CROO credentials:

- Skip A2A orchestration.
- Keep base campaign pipeline working.
- Report no fake A2A success.

Universal Workbench payment failure:

- Persist `A2ADelegation.status = FAILED`.
- Leave the scheduled post retryable at `ACQUIRE`.
- Include the failure in report output.

Universal Workbench timeout after payment:

- Persist current status and error.
- Retry later by resuming from existing downstream order ID.

Safety task returns `BLOCK`:

- Mark the post as `SKIPPED`.
- Store the safety reason in `failureReason`.
- Do not post.

Safety task returns `WARN`:

- Continue to internal deterministic review.
- Add warning context to `rawMaterial`.

Safety task returns unstructured text:

- Treat as `WARN`.
- Preserve the raw delivery in the report.

## Report Proof

`ContentAgentDeliverable.a2aDelegations[]` should include:

- `taskType`
- downstream agent name
- downstream service ID
- downstream negotiation ID
- downstream order ID
- status
- paid timestamp
- completed timestamp
- redacted request JSON
- redacted response JSON
- error, if any

README and demo output should show:

```text
Mirai upstream order: <order-id>
Research CAP order: <order-id> paid/completed
Creative CAP order: <order-id> paid/completed
Safety CAP order: <order-id> paid/completed
Final post/report: <campaign-id>
```

## Testing Strategy

Unit tests:

- Builds distinct Universal Workbench requests for `research-pack`, `creative-pack`, and `safety-pack`.
- Reuses completed delegations by `taskType`.
- Merges research and creative outputs into grounding signals.
- Converts safety `BLOCK` into a skipped post decision.
- Redacts private downstream proof from report payloads.

Integration tests:

- Runs orchestrator with a fake CROO client and verifies negotiate/pay/poll sequence for all three tasks.
- Verifies retry resumes from existing downstream order IDs.

Manual paid E2E:

- Add a script or extend `pnpm test:e2e:real-a2a` to execute the three-task Universal Workbench flow.
- Print redacted JSON proof with all downstream order IDs and tx hashes.
- Refuse payment above `MAX_APPROVED_MICRO_USDC`.

## Non-Goals

- Do not claim there are three different downstream agents.
- Do not create fake A2A success when CROO credentials are missing.
- Do not self-trade by hiring Mirai's own service as the downstream provider.
- Do not build a generalized multi-agent marketplace framework.

## Open Decision

Whether to add `taskType` as a Prisma column or keep it only inside `requestJson`.

Recommendation: add the column. It improves report readability, makes idempotency safer, and gives judges a clean trace of the three delegated work orders.
