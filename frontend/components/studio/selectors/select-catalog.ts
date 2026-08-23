import {
  galleryItemCategory,
  parseGalleryRecipe,
  type Blueprint,
  type BlueprintDetail,
  type GalleryItem,
  type LoraStackEntry,
} from "@/lib/host"
import type { StudioStore } from "../studio-store-types"
import {
  computeActiveDetail,
  computeActiveSelectedId,
  computeTabBlueprints,
} from "../slices/helpers"

/** Blueprints for the active studio tab. */
export function selectTabBlueprints(s: StudioStore): Blueprint[] {
  return computeTabBlueprints(s.blueprints, s.studioTab)
}

/** Gallery items for the active studio tab; empty on Creator, Downloads, and Tools. */
export function selectTabGallery(s: StudioStore): GalleryItem[] {
  if (
    s.studioTab === "creator" ||
    s.studioTab === "downloads" ||
    s.studioTab === "tools"
  ) {
    return []
  }
  return s.gallery.filter((item) => galleryItemCategory(item) === s.studioTab)
}

/** Selected blueprint id if it exists in the tab list; otherwise the tab fallback. */
export function selectActiveSelectedId(s: StudioStore): string | null {
  return computeActiveSelectedId(selectTabBlueprints(s), s.selectedId)
}

/** Blueprint detail only when it matches the active selection. */
export function selectActiveDetail(s: StudioStore): BlueprintDetail | null {
  return computeActiveDetail(s.detail, selectActiveSelectedId(s))
}

/** Active tab blueprint row, or null when nothing is selected. */
export function selectSelected(s: StudioStore): Blueprint | null {
  const id = selectActiveSelectedId(s)
  return selectTabBlueprints(s).find((bp) => bp.id === id) ?? null
}

/** Selected gallery item on the active tab; null when the id is missing or belongs to another tab. */
export function selectPreviewItem(s: StudioStore): GalleryItem | null {
  if (!s.selectedGalleryId) return null
  return (
    selectTabGallery(s).find((item) => item.id === s.selectedGalleryId) ?? null
  )
}

/** True when the active blueprint exposes both width and height controls. */
export function selectHasSizeControls(s: StudioStore): boolean {
  const detail = selectActiveDetail(s)
  const controls = detail?.controls ?? []
  return (
    controls.some((c) => c.id === "width") &&
    controls.some((c) => c.id === "height")
  )
}

/** CFG from controlValues, then blueprint default, then 1. */
export function selectCfgValue(s: StudioStore): number {
  const detail = selectActiveDetail(s)
  return Number(
    s.controlValues.cfg ??
      detail?.controls?.find((c) => c.id === "cfg")?.default ??
      1
  )
}

/** Whether the active blueprint accepts LoRAs. */
export function selectSupportsLoras(s: StudioStore): boolean {
  return Boolean(selectActiveDetail(s)?.capabilities?.loras)
}

/** Architecture of the active blueprint; null when detail is stale or missing. */
export function selectActiveArch(s: StudioStore): string | null {
  return selectActiveDetail(s)?.arch ?? null
}

/** LoRA stack entries whose pack has a variant for the active architecture; empty with no arch. */
export function selectActiveLoraStack(s: StudioStore): LoraStackEntry[] {
  const activeArch = selectActiveArch(s)
  if (!activeArch) return []
  return s.loraStack.filter((entry) =>
    s.loraPacks.some(
      (p) => p.id === entry.id && p.variants.some((v) => v.arch === activeArch)
    )
  )
}

/** Negative prompt is offered only when the blueprint supports it and CFG is above 1. */
export function selectHasNegativePrompt(s: StudioStore): boolean {
  return Boolean(
    selectActiveDetail(s)?.capabilities?.negative && selectCfgValue(s) > 1
  )
}

/** Advanced/core controls minus prompt, negative, and size sliders already owned by the aspect picker. */
export function selectAdvancedControls(
  s: StudioStore
): NonNullable<BlueprintDetail["controls"]> {
  const detail = selectActiveDetail(s)
  const hasSize = selectHasSizeControls(s)
  return (detail?.controls ?? []).filter((c) => {
    if (c.group !== "advanced" && c.group !== "core") return false
    if (c.id === "prompt" || c.id === "negative") return false
    if (hasSize && c.id === "width") return false
    if (hasSize && c.id === "height") return false
    return true
  })
}

/** Seed from the newest tab gallery item's recipe; null when missing or unparseable. */
export function selectLatestGallerySeed(s: StudioStore): number | null {
  const tabGallery = selectTabGallery(s)
  const recipe = tabGallery[0] ? parseGalleryRecipe(tabGallery[0]) : null
  const seed = Number(recipe?.values.seed)
  return Number.isFinite(seed) ? seed : null
}
