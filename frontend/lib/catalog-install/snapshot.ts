import {
  blueprintIdFromJobKey,
  loraKeyFromJobKey,
  promptToolsModelIdFromJobKey,
  upscaleIdFromJobKey,
} from "./job-keys"
import type { DownloadSnapshotLike } from "./types"

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

export function nextPendingUpscaleIds(
  pending: string[],
  snapshot: DownloadSnapshotLike
): string[] {
  const live = liveUpscaleIds(snapshot)
  return pending.filter((id) => !live.has(id))
}

export function addPendingUpscaleId(pending: string[], id: string): string[] {
  return pending.includes(id) ? pending : [...pending, id]
}

export function dropPendingUpscaleId(pending: string[], id: string): string[] {
  return pending.filter((x) => x !== id)
}

function activeJobKey(snapshot: DownloadSnapshotLike): string | null {
  return snapshot.active?.jobKey ?? null
}

export function installingBlueprintId(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? (blueprintIdFromJobKey(key) ?? key) : null
}

export function queuedBlueprintIds(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.map((job) => {
    const key = job.jobKey ?? ""
    return blueprintIdFromJobKey(key) ?? key
  })
}

export function installingLoraKey(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? loraKeyFromJobKey(key) : null
}

export function queuedLoraKeys(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.flatMap((job) => {
    const key = job.jobKey ? loraKeyFromJobKey(job.jobKey) : null
    return key ? [key] : []
  })
}

export function installingUpscaleId(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? upscaleIdFromJobKey(key) : null
}

export function queuedUpscaleIds(snapshot: DownloadSnapshotLike): string[] {
  return snapshot.queued.flatMap((job) => {
    const id = job.jobKey ? upscaleIdFromJobKey(job.jobKey) : null
    return id ? [id] : []
  })
}

export function installingPromptToolsProvider(
  snapshot: DownloadSnapshotLike
): string | null {
  const key = activeJobKey(snapshot)
  return key ? promptToolsModelIdFromJobKey(key) : null
}
