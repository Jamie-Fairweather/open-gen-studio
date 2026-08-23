import type { JobQueueItem } from "@/lib/host"
import type { FinishGenerateLaneInput, FinishGenerateLaneResult } from "./types"

/** Store slice `finishGenerateJob` writes (queue, generating, live preview). */
export type GenerateLaneHost = {
  jobQueue: readonly JobQueueItem[]
  activeJobId: string | null
  setJobQueue: (
    next: JobQueueItem[] | ((prev: JobQueueItem[]) => JobQueueItem[])
  ) => void
  setGenerating: (next: boolean) => void
  setActiveJobId: (
    next: string | null | ((id: string | null) => string | null)
  ) => void
  clearLivePreview: () => void
}

/** Drop a finished generate Job and decide whether the live preview stays. */
export function finishGenerateLane(
  input: FinishGenerateLaneInput
): FinishGenerateLaneResult {
  const queue = input.queue.filter((item) => item.jobId !== input.jobId)
  const generating = queue.some((item) => item.kind === "generate")
  return {
    queue,
    generating,
    activeJobId: input.activeJobId === input.jobId ? null : input.activeJobId,
    clearPreview: !generating,
  }
}

/** Apply finishGenerateLane to the studio store (queue, generating, preview). */
export function finishGenerateJob(
  getStore: () => GenerateLaneHost,
  jobId: string
) {
  const store = getStore()
  const next = finishGenerateLane({
    jobId,
    queue: store.jobQueue,
    activeJobId: store.activeJobId,
  })
  store.setJobQueue(next.queue)
  store.setGenerating(next.generating)
  store.setActiveJobId(next.activeJobId)
  if (next.clearPreview) store.clearLivePreview()
}
