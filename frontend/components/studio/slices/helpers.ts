import type { SetStateAction } from "react"
import type { Blueprint, BlueprintDetail, StudioTab } from "@/lib/host"
import { isInstalled } from "@/lib/blueprint-helpers"

export function applySet<T>(prev: T, next: SetStateAction<T>): T {
  return typeof next === "function" ? (next as (p: T) => T)(prev) : next
}

/** Mirrors StudioProvider's `tabBlueprints` memo - blueprints scoped to the active tab. */
export function computeTabBlueprints(
  blueprints: Blueprint[],
  studioTab: StudioTab
): Blueprint[] {
  if (
    studioTab === "creator" ||
    studioTab === "downloads" ||
    studioTab === "tools"
  ) {
    return studioTab === "downloads" ? blueprints : []
  }
  return blueprints.filter((bp) => bp.category.toLowerCase() === studioTab)
}

/** Mirrors StudioProvider's `activeSelectedId` - falls back to the first installed blueprint. */
export function computeActiveSelectedId(
  tabBlueprints: Blueprint[],
  selectedId: string | null
): string | null {
  return selectedId && tabBlueprints.some((bp) => bp.id === selectedId)
    ? selectedId
    : (tabBlueprints.find(isInstalled)?.id ?? tabBlueprints[0]?.id ?? null)
}

/** Mirrors StudioProvider's `activeDetail` - only valid when it matches the active selection. */
export function computeActiveDetail(
  detail: BlueprintDetail | null,
  activeSelectedId: string | null
): BlueprintDetail | null {
  return activeSelectedId && detail?.id === activeSelectedId ? detail : null
}

export const DEFAULT_UPSCALE_MODEL_ID = "4x-ultrasharp"

export const SETTING_SELECTED_BLUEPRINT = "selected_blueprint_id"
export const SETTING_GPU_VENDOR = "gpu_vendor"
export const SETTING_NVIDIA_PORTABLE_OVERRIDE = "nvidia_portable_override"

export function blueprintIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("blueprint:")
    ? jobKey.slice("blueprint:".length)
    : null
}

export function loraKeyFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("lora:") ? jobKey.slice("lora:".length) : null
}

export function upscaleIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("upscale:") ? jobKey.slice("upscale:".length) : null
}

/** Shared Qwen-VL install job key prefix used by Prompt Tools providers. */
export function promptToolsModelIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("prompt-tools:")
    ? jobKey.slice("prompt-tools:".length)
    : null
}

export function isPromptToolsJobKey(jobKey: string): boolean {
  return jobKey.startsWith("prompt-tools:")
}
