import type { ApplyGenerateQueueResult } from "./types"

/** Derive generating / active Job from a GPU-queue snapshot. */
export function applyGenerateQueue(
  items: readonly { kind: string; status: string; jobId: string }[]
): ApplyGenerateQueueResult {
  const running = items.find(
    (item) => item.kind === "generate" && item.status === "running"
  )
  if (running) return { action: "running", jobId: running.jobId }
  if (items.some((item) => item.kind === "generate")) {
    return { action: "queued" }
  }
  return { action: "idle" }
}
