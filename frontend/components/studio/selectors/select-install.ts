import {
  installingBlueprintId,
  installingLoraKey,
  installingUpscaleId,
  queuedBlueprintIds,
  queuedLoraKeys,
  queuedUpscaleIds,
} from "@/lib/catalog-install"
import type { StudioStore } from "../studio-store-types"

/** ComfyUI runtime row, if one is registered. */
export function selectComfy(s: StudioStore) {
  return s.runtimes.find((r) => r.engine === "comfyui")
}

/** Job key of the download currently transferring. */
export function selectActiveJobKey(s: StudioStore): string | null {
  return s.downloadSnapshot.active?.jobKey ?? null
}

/** Blueprint id currently installing from the download snapshot. */
export function selectInstallingId(s: StudioStore): string | null {
  return installingBlueprintId(s.downloadSnapshot)
}

/** Blueprint ids queued behind the active download. */
export function selectInstallQueue(s: StudioStore): string[] {
  return queuedBlueprintIds(s.downloadSnapshot)
}

/** `id:arch` key of the LoRA variant currently installing. */
export function selectLoraInstallingKey(s: StudioStore): string | null {
  return installingLoraKey(s.downloadSnapshot)
}

/** `id:arch` keys of LoRA variants waiting in the download queue. */
export function selectLoraQueuedKeys(s: StudioStore): string[] {
  return queuedLoraKeys(s.downloadSnapshot)
}

/** Upscale model id currently installing from the download snapshot. */
export function selectUpscaleInstallingId(s: StudioStore): string | null {
  return installingUpscaleId(s.downloadSnapshot)
}

/** Upscale model ids waiting in the download queue. */
export function selectUpscaleQueuedIds(s: StudioStore): string[] {
  return queuedUpscaleIds(s.downloadSnapshot)
}

/** Optimistic upscale ids clicked before the download snapshot catches up. */
export function selectUpscalePendingIds(s: StudioStore): string[] {
  return s.pendingUpscaleIds
}
