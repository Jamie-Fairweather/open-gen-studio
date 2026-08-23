import {
  blueprintIdFromJobKey,
  loraKeyFromJobKey,
  promptToolsModelIdFromJobKey,
  upscaleIdFromJobKey,
} from "./job-keys"
import type { DownloadSnapshotLike } from "./types"

/** Upscale ids currently active or queued in the download snapshot. */
export function liveUpscaleIds(snapshot: DownloadSnapshotLike): Set<string> {
  const live = new Set<string>()
  if (snapshot.active?.jobKey) {
    const id = upscaleIdFromJobKey(snapshot.active.jobKey)
    if (id) live.add(id)
  }
  for (const job of snapshot.queued) {
    if (!job.jobKey) continue
    const id = upscaleIdFromJobKey(job.jobKey)
    if (id) live.add(id)
  }
  return live
}

/** Pending upscale ids that are not already live in the download queue. */
export function nextPendingUpscaleIds(
  pending: string[],
  snapshot: DownloadSnapshotLike
): string[] {
  const live = liveUpscaleIds(snapshot)
  return pending.filter((id) => !live.has(id))
}

/** Append an upscale id to pending if it is not already there. */
export function addPendingUpscaleId(pending: string[], id: string): string[] {
  return pending.includes(id) ? pending : [...pending, id]
}

/** Remove one upscale id from the pending-start list. */
export function dropPendingUpscaleId(pending: string[], id: string): string[] {
  return pending.filter((x) => x !== id)
}

function activeJobKey(snapshot: DownloadSnapshotLike): string | null {
  return snapshot.active?.jobKey ?? null
}

/** Active download's blueprint id (`blueprint:` prefix, or raw key as fallback). */
export function installingBlueprintId(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? (blueprintIdFromJobKey(key) ?? key) : null
}

/** Queued download keys mapped to blueprint ids (same fallback as active). */
export function queuedBlueprintIds(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.map((job) => {
    const key = job.jobKey ?? ""
    return blueprintIdFromJobKey(key) ?? key
  })
}

/** Active download's LoRA key, or null if the active job is not a LoRA. */
export function installingLoraKey(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? loraKeyFromJobKey(key) : null
}

/** LoRA keys in the download queue (non-LoRA jobs omitted). */
export function queuedLoraKeys(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.flatMap((job) => {
    const key = job.jobKey ? loraKeyFromJobKey(job.jobKey) : null
    return key ? [key] : []
  })
}

/** Active download's upscale id, or null if not an upscale job. */
export function installingUpscaleId(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? upscaleIdFromJobKey(key) : null
}

/** Upscale ids in the download queue (other kinds omitted). */
export function queuedUpscaleIds(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.flatMap((job) => {
    const id = job.jobKey ? upscaleIdFromJobKey(job.jobKey) : null
    return id ? [id] : []
  })
}

/** Active Prompt Tools provider id, or null if the active job is unrelated. */
export function installingPromptToolsProvider(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? promptToolsModelIdFromJobKey(key) : null
}
