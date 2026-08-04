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

export function selectTabBlueprints(s: StudioStore): Blueprint[] {
  return computeTabBlueprints(s.blueprints, s.studioTab)
}

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

export function selectActiveSelectedId(s: StudioStore): string | null {
  return computeActiveSelectedId(selectTabBlueprints(s), s.selectedId)
}

export function selectActiveDetail(s: StudioStore): BlueprintDetail | null {
  return computeActiveDetail(s.detail, selectActiveSelectedId(s))
}

export function selectSelected(s: StudioStore): Blueprint | null {
  const id = selectActiveSelectedId(s)
  return selectTabBlueprints(s).find((bp) => bp.id === id) ?? null
}

export function selectPreviewItem(s: StudioStore): GalleryItem | null {
  if (!s.selectedGalleryId) return null
  return (
    selectTabGallery(s).find((item) => item.id === s.selectedGalleryId) ?? null
  )
}

export function selectHasSizeControls(s: StudioStore): boolean {
  const detail = selectActiveDetail(s)
  return (
    (detail?.controls ?? []).some((c) => c.id === "width") &&
    (detail?.controls ?? []).some((c) => c.id === "height")
  )
}

export function selectCfgValue(s: StudioStore): number {
  const detail = selectActiveDetail(s)
  return Number(
    s.controlValues.cfg ??
      detail?.controls?.find((c) => c.id === "cfg")?.default ??
      1
  )
}

export function selectSupportsLoras(s: StudioStore): boolean {
  return Boolean(selectActiveDetail(s)?.capabilities?.loras)
}

export function selectActiveArch(s: StudioStore): string | null {
  return selectActiveDetail(s)?.arch ?? null
}

export function selectActiveLoraStack(s: StudioStore): LoraStackEntry[] {
  const activeArch = selectActiveArch(s)
  if (!activeArch) return []
  return s.loraStack.filter((entry) =>
    s.loraPacks.some(
      (p) => p.id === entry.id && p.variants.some((v) => v.arch === activeArch)
    )
  )
}

export function selectHasNegativePrompt(s: StudioStore): boolean {
  return Boolean(
    selectActiveDetail(s)?.capabilities?.negative && selectCfgValue(s) > 1
  )
}

export function selectAdvancedControls(
  s: StudioStore
): NonNullable<BlueprintDetail["controls"]> {
  const detail = selectActiveDetail(s)
  const hasSize = selectHasSizeControls(s)
  return (detail?.controls ?? []).filter(
    (c) =>
      (c.group === "advanced" || c.group === "core") &&
      c.id !== "prompt" &&
      c.id !== "negative" &&
      !(hasSize && (c.id === "width" || c.id === "height"))
  )
}

export function selectLatestGallerySeed(s: StudioStore): number | null {
  const tabGallery = selectTabGallery(s)
  const recipe = tabGallery[0] ? parseGalleryRecipe(tabGallery[0]) : null
  const seed = Number(recipe?.values.seed)
  return Number.isFinite(seed) ? seed : null
}
