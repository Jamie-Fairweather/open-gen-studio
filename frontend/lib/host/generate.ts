import { commands } from "@/lib/generated/bindings"
import type { Job, JobHistoryItem, JobQueueSnapshot } from "./types"

/** Current GPU jobs via `list_jobs`. */
export async function listJobs(): Promise<Job[]> {
  return commands.listJobs()
}

/** Insert a job record via `create_job` without starting generation. */
export async function createJob(
  kind: string,
  paramsJson?: string
): Promise<Job> {
  return commands.createJob(kind, paramsJson ?? null)
}

/** Patch a job's status / error via `update_job_status`. */
export async function updateJobStatus(
  id: string,
  status: string,
  error?: string | null
): Promise<Job> {
  return commands.updateJobStatus(id, status, error ?? null)
}

/** Queue a generate via `generate_image`; returns immediately and runs when a slot is free. */
export async function generateImage(
  blueprintId: string,
  values: Record<string, unknown>
): Promise<Job> {
  return commands.generateImage(blueprintId, values)
}

/** Request cancel of a running or queued job via `cancel_job`. */
export async function cancelJob(id: string): Promise<Job> {
  return commands.cancelJob(id)
}

/** GPU-queue snapshot (active + pending) via `list_job_queue`. */
export async function listJobQueue(): Promise<JobQueueSnapshot> {
  return commands.listJobQueue()
}

/** Completed / failed job history via `list_job_history`. */
export async function listJobHistory(): Promise<JobHistoryItem[]> {
  return commands.listJobHistory()
}

/** Pause a queued or running job via `pause_job`. */
export async function pauseJob(id: string): Promise<Job> {
  return commands.pauseJob(id)
}

/** Resume a paused job via `resume_job`. */
export async function resumeJob(id: string): Promise<Job> {
  return commands.resumeJob(id)
}

/** Rewrite pending-job order via `reorder_job_queue`. */
export async function reorderJobQueue(
  orderedIds: string[]
): Promise<JobQueueSnapshot> {
  return commands.reorderJobQueue(orderedIds)
}

/** Empty the pending queue via `clear_job_queue`. */
export async function clearJobQueue(): Promise<void> {
  await commands.clearJobQueue()
}

/** Remove one history row via `delete_job_history_item`; `deleteGallery` also deletes its output files. */
export async function deleteJobHistoryItem(
  id: string,
  deleteGallery: boolean
): Promise<void> {
  await commands.deleteJobHistoryItem(id, deleteGallery)
}

/** Wipe job history via `clear_job_history`; `deleteGallery` also deletes output files. */
export async function clearJobHistory(deleteGallery: boolean): Promise<void> {
  await commands.clearJobHistory(deleteGallery)
}

/** Unload Comfy models to free VRAM via `free_comfy_vram`. */
export async function freeComfyVram(): Promise<void> {
  await commands.freeComfyVram()
}
