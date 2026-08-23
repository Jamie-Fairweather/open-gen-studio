"use client"

import { arrayMove } from "@dnd-kit/sortable"
import type { DragEndEvent } from "@dnd-kit/core"
import { useStudioStore } from "@/components/studio/store"
import { clearJobQueue, reorderJobQueue, type JobQueueItem } from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

/** Shared clear / reorder helpers for queue rail + expand dialog. */
export function useJobQueueActions() {
  const jobQueue = useStudioStore((s) => s.jobQueue)
  const setJobQueue = useStudioStore((s) => s.setJobQueue)
  const setGenerating = useStudioStore((s) => s.setGenerating)
  const setActiveJobId = useStudioStore((s) => s.setActiveJobId)

  const waiting = jobQueue.filter((i) => i.status === "queued")
  const waitingIds = waiting.map((w) => w.jobId)

  function clearQueue() {
    setJobQueue([])
    setGenerating(false)
    setActiveJobId(null)
    void clearJobQueue()
      .then(() => notifySuccess("Queue cleared"))
      .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
  }

  function reorderWaiting(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = waitingIds.indexOf(String(active.id))
    const newIndex = waitingIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const nextWaiting = arrayMove(waiting, oldIndex, newIndex)
    const head = jobQueue.filter((i) => i.status !== "queued")
    setJobQueue([...head, ...nextWaiting])
    void reorderJobQueue(nextWaiting.map((i) => i.jobId)).catch((e) =>
      notifyError(e instanceof Error ? e.message : String(e))
    )
  }

  return {
    jobQueue,
    waiting,
    waitingIds,
    clearQueue,
    reorderWaiting,
  }
}

/** Live sampler progress for the running generate job only. */
export function runningStepLabel(
  jobQueue: JobQueueItem[],
  genStep: { jobId: string; step: number; max: number } | null
): string | null {
  const running = jobQueue.find((i) => i.status === "running")
  if (
    running &&
    running.kind === "generate" &&
    genStep &&
    genStep.jobId === running.jobId &&
    genStep.max > 0
  ) {
    return `${genStep.step}/${genStep.max}`
  }
  return null
}
