import type { PlanGenerateLaneInput, PlanGenerateLaneResult } from "./types"

/** GPU-queue collision: start a fresh lane, or enqueue behind the running Job. */
export function planGenerateLane(
  input: PlanGenerateLaneInput
): PlanGenerateLaneResult {
  const followLive = !input.generating
  if (input.runningJobId) {
    return {
      action: "enqueue",
      runningJobId: input.runningJobId,
      followLive,
    }
  }
  return { action: "start-lane", followLive }
}
