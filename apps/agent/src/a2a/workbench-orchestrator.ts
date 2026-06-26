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
