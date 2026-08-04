import {
  galleryItemCategory,
  parseGalleryRecipe,
  type Blueprint,
  type BlueprintDetail,
  type GalleryItem,
  type LoraStackEntry,
  type StudioTab,
} from "@/lib/host"
import { SIDE_RAIL_WIDTH } from "@/components/shell"
import { STUDIO_TABS } from "@/components/studio/studio-tabs"
import { sizeFromAspectAndSide } from "@/lib/image-size"
import type { StudioStore } from "./studio-store-types"
import {
  blueprintIdFromJobKey,
  computeActiveDetail,
  computeActiveSelectedId,
  computeTabBlueprints,
  loraKeyFromJobKey,
  upscaleIdFromJobKey,
} from "./slices/helpers"

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

export function selectResolvedSize(s: StudioStore): {
  width: number
  height: number
} {
  return sizeFromAspectAndSide(s.aspectId, s.sideLength)
}

export function selectSizeLabel(s: StudioStore): string {
  const width = Number(s.controlValues.width)
  const height = Number(s.controlValues.height)
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return `${width}×${height}`
  }
  const resolved = selectResolvedSize(s)
  return `${resolved.width}×${resolved.height}`
}

export function selectStageDims(s: StudioStore): {
  width: number
  height: number
} {
  const fromPair = (wRaw: unknown, hRaw: unknown) => {
    const w = Number(wRaw)
    const h = Number(hRaw)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { width: w, height: h }
    }
    return null
  }
  const resolved = selectResolvedSize(s)
  if (s.followLive && (s.livePreviewSrc || s.pendingPreviewSrc)) {
    return (
      fromPair(s.controlValues.width, s.controlValues.height) ?? {
        width: resolved.width,
        height: resolved.height,
      }
    )
  }
  const previewItem = selectPreviewItem(s)
  if (previewItem) {
    const recipe = parseGalleryRecipe(previewItem)
    const fromRecipe = fromPair(recipe?.values.width, recipe?.values.height)
    if (fromRecipe) return fromRecipe
  }
  return (
    fromPair(s.controlValues.width, s.controlValues.height) ?? {
      width: resolved.width,
      height: resolved.height,
    }
  )
}

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

export function selectStudioLabel(s: StudioStore): string {
  return STUDIO_TABS.find((tab) => tab.id === s.studioTab)?.label ?? "Image"
}

export function selectCanGenerate(s: StudioStore): boolean {
  return s.studioTab === "image"
}

export function selectShowCreator(s: StudioStore): boolean {
  return s.studioTab === "creator"
}

export function selectShowDownloads(s: StudioStore): boolean {
  return s.studioTab === "downloads"
}

export function selectShowTools(s: StudioStore): boolean {
  return s.studioTab === "tools"
}

export function selectShowSettings(s: StudioStore): boolean {
  return s.studioTab === "settings"
}

export function selectShowGalleryRail(s: StudioStore): boolean {
  return (
    !selectShowCreator(s) &&
    !selectShowDownloads(s) &&
    !selectShowTools(s) &&
    !selectShowSettings(s)
  )
}

export function selectShowAdvancedRail(s: StudioStore): boolean {
  return selectShowGalleryRail(s) && selectCanGenerate(s)
}

export function selectStageInsetLeft(s: StudioStore): string | undefined {
  return selectShowAdvancedRail(s) && s.advancedOpen
    ? SIDE_RAIL_WIDTH
    : undefined
}

export function selectStageInsetRight(s: StudioStore): string | undefined {
  return selectShowGalleryRail(s) && s.galleryOpen ? SIDE_RAIL_WIDTH : undefined
}

export type StudioTabFlags = {
  canGenerate: boolean
  showCreator: boolean
  showDownloads: boolean
  showTools: boolean
  showGalleryRail: boolean
  showAdvancedRail: boolean
  studioLabel: string
  studioTab: StudioTab
}

export function selectTabFlags(s: StudioStore): StudioTabFlags {
  return {
    canGenerate: selectCanGenerate(s),
    showCreator: selectShowCreator(s),
    showDownloads: selectShowDownloads(s),
    showTools: selectShowTools(s),
    showGalleryRail: selectShowGalleryRail(s),
    showAdvancedRail: selectShowAdvancedRail(s),
    studioLabel: selectStudioLabel(s),
    studioTab: s.studioTab,
  }
}
