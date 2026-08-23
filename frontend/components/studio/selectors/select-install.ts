import {
  installingBlueprintId,
  installingLoraKey,
  installingUpscaleId,
  queuedBlueprintIds,
  queuedLoraKeys,
  queuedUpscaleIds,
} from "@/lib/catalog-install"
import type { StudioStore } from "../studio-store-types"

export function selectComfy(s: StudioStore) {
  return s.runtimes.find((r) => r.engine === "comfyui")
}

export function selectActiveJobKey(s: StudioStore): string | null {
  return s.downloadSnapshot.active?.jobKey ?? null
}

export function selectInstallingId(s: StudioStore): string | null {
  return installingBlueprintId(s.downloadSnapshot)
}

export function selectInstallQueue(s: StudioStore): string[] {
  return queuedBlueprintIds(s.downloadSnapshot)
}

export function selectLoraInstallingKey(s: StudioStore): string | null {
  return installingLoraKey(s.downloadSnapshot)
}

export function selectLoraQueuedKeys(s: StudioStore): string[] {
  return queuedLoraKeys(s.downloadSnapshot)
}

export function selectUpscaleInstallingId(s: StudioStore): string | null {
  return installingUpscaleId(s.downloadSnapshot)
}

export function selectUpscaleQueuedIds(s: StudioStore): string[] {
  return queuedUpscaleIds(s.downloadSnapshot)
}

export function selectUpscalePendingIds(s: StudioStore): string[] {
  return s.pendingUpscaleIds
}
