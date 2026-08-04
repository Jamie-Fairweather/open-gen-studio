import type { StudioStore } from "../studio-store-types"
import {
  blueprintIdFromJobKey,
  loraKeyFromJobKey,
  upscaleIdFromJobKey,
} from "../slices/helpers"

export function selectComfy(s: StudioStore) {
  return s.runtimes.find((r) => r.engine === "comfyui")
}

export function selectActiveJobKey(s: StudioStore): string | null {
  return s.downloadSnapshot.active?.jobKey ?? null
}

export function selectInstallingId(s: StudioStore): string | null {
  const key = selectActiveJobKey(s)
  return key ? (blueprintIdFromJobKey(key) ?? key) : null
}

export function selectInstallQueue(s: StudioStore): string[] {
  return s.downloadSnapshot.queued.map((job) => {
    const bp = blueprintIdFromJobKey(job.jobKey)
    return bp ?? job.jobKey
  })
}

export function selectLoraInstallingKey(s: StudioStore): string | null {
  const key = selectActiveJobKey(s)
  return key ? loraKeyFromJobKey(key) : null
}

export function selectLoraQueuedKeys(s: StudioStore): string[] {
  return s.downloadSnapshot.queued.flatMap((job) => {
    const key = loraKeyFromJobKey(job.jobKey)
    return key ? [key] : []
  })
}

export function selectUpscaleInstallingId(s: StudioStore): string | null {
  const key = selectActiveJobKey(s)
  return key ? upscaleIdFromJobKey(key) : null
}

export function selectUpscaleQueuedIds(s: StudioStore): string[] {
  return s.downloadSnapshot.queued.flatMap((job) => {
    const id = upscaleIdFromJobKey(job.jobKey)
    return id ? [id] : []
  })
}

export function selectUpscalePendingIds(s: StudioStore): string[] {
  return s.pendingUpscaleIds
}
