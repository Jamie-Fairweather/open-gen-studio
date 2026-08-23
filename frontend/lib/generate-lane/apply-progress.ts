import type {
  PlanGenerateJobUpdateInput,
  PlanGenerateJobUpdateResult,
  PlanGenerateProgressInput,
  PlanGenerateProgressResult,
} from "./types"

/** Map a generate progress event. Prompt Tools are filtered by the listener first. */
export function planGenerateProgress(
  input: PlanGenerateProgressInput
): PlanGenerateProgressResult {
  if (input.stage === "start") {
    return { action: "runtime-start", message: input.message ?? "" }
  }
  if (input.stage === "step") {
    if (input.step != null && input.max != null && input.max > 0) {
      return {
        action: "step",
        jobId: input.jobId,
        step: input.step,
        max: input.max,
      }
    }
    return { action: "dismiss-runtime" }
  }
  if (input.stage === "preview") {
    if (input.previewPath) {
      return { action: "preview", path: input.previewPath }
    }
    return { action: "dismiss-runtime" }
  }
  if (input.stage === "done") return { action: "finish", notify: null }
  if (input.stage === "cancelled") {
    return {
      action: "finish",
      notify: "cancelled",
      message: input.message ?? "",
    }
  }
  if (input.stage === "error") {
    return { action: "finish", notify: "error", message: input.message ?? "" }
  }
  return { action: "dismiss-runtime" }
}

/** Map jobs://updated for the generate lane. Other kinds only prune when terminal. */
export function planGenerateJobUpdate(
  input: PlanGenerateJobUpdateInput
): PlanGenerateJobUpdateResult {
  const terminal =
    input.status === "completed" ||
    input.status === "failed" ||
    input.status === "cancelled"
  if (!terminal) return { action: "ignore" }
  if (input.kind !== "generate") return { action: "prune" }
  if (input.status === "failed" && input.error) {
    return { action: "finish", notify: "failed", message: input.error }
  }
  if (input.status === "cancelled") {
    return { action: "finish", notify: "cancelled" }
  }
  return { action: "finish", notify: null }
}
