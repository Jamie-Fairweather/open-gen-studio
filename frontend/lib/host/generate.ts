import { commands } from "@/lib/generated/bindings"
import type { Job } from "./types"

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

export async function freeComfyVram(): Promise<void> {
  await commands.freeComfyVram()
}
