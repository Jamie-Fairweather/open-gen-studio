import type {
  PlanFirstRunInstallInput,
  PlanFirstRunInstallResult,
} from "./types"

/** Decide the next first-run install kick. Overlay maps snapshot/jobs to booleans. */
export function planFirstRunInstall(
  input: PlanFirstRunInstallInput
): PlanFirstRunInstallResult {
  if (input.step !== "install" || !input.blueprintId || input.hidden) {
    return { action: "wait" }
  }

  if (input.runtimeReady && input.blueprintFound && input.blueprintInstalled) {
    return { action: "done" }
  }

  if (!input.runtimeReady) {
    if (input.runtimeError) return { action: "reset-runtime-started" }
    if (
      input.runtimeJobPending ||
      input.runtimeInstalling ||
      input.runtimeStarted
    ) {
      return { action: "wait" }
    }
    return { action: "start-runtime" }
  }

  if (input.runtimeJobPending) return { action: "wait" }
  if (input.blueprintJobError) return { action: "reset-blueprint-started" }
  if (
    !input.blueprintFound ||
    input.blueprintInstalled ||
    input.blueprintStarted
  ) {
    return { action: "wait" }
  }
  if (input.blueprintJobQueued) return { action: "mark-blueprint-queued" }
  return { action: "start-blueprint" }
}
