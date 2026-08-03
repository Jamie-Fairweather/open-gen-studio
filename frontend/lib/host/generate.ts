import { commands } from "@/lib/generated/bindings"
import type { Job, JobHistoryItem, JobQueueSnapshot } from "./types"

export async function listJobs(): Promise<Job[]> {
  return commands.listJobs()
}

export async function createJob(
  kind: string,
  paramsJson?: string
): Promise<Job> {
  return commands.createJob(kind, paramsJson ?? null)
}

export async function updateJobStatus(
  id: string,
  status: string,
  error?: string | null
): Promise<Job> {
  return commands.updateJobStatus(id, status, error ?? null)
}

export async function generateImage(
  blueprintId: string,
  values: Record<string, unknown>
): Promise<Job> {
  return commands.generateImage(blueprintId, values)
}

export async function cancelJob(id: string): Promise<Job> {
  return commands.cancelJob(id)
}

export async function listJobQueue(): Promise<JobQueueSnapshot> {
  return commands.listJobQueue()
}

export async function listJobHistory(): Promise<JobHistoryItem[]> {
  return commands.listJobHistory()
}

export async function pauseJob(id: string): Promise<Job> {
  return commands.pauseJob(id)
}

export async function resumeJob(id: string): Promise<Job> {
  return commands.resumeJob(id)
}

export async function reorderJobQueue(
  orderedIds: string[]
): Promise<JobQueueSnapshot> {
  return commands.reorderJobQueue(orderedIds)
}

export async function clearJobQueue(): Promise<void> {
  await commands.clearJobQueue()
}

export async function deleteJobHistoryItem(
  id: string,
  deleteGallery: boolean
): Promise<void> {
  await commands.deleteJobHistoryItem(id, deleteGallery)
}

export async function clearJobHistory(deleteGallery: boolean): Promise<void> {
  await commands.clearJobHistory(deleteGallery)
}

export async function freeComfyVram(): Promise<void> {
  await commands.freeComfyVram()
}
