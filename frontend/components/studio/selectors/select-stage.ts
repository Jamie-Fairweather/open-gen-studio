import { parseGalleryRecipe } from "@/lib/host"
import { SIDE_RAIL_WIDTH } from "@/components/shell/side-rail"
import { sizeFromAspectAndSide } from "@/lib/image-size"
import type { StudioStore } from "../studio-store-types"
import { selectPreviewItem } from "./select-catalog"
import { selectShowAdvancedRail, selectShowGalleryRail } from "./select-tabs"

/** Pixel size from the current aspect + side-length pair. */
export function selectResolvedSize(s: StudioStore): {
  width: number
  height: number
} {
  return sizeFromAspectAndSide(s.aspectId, s.sideLength)
}

/** WxH label from control values when valid; otherwise the resolved aspect size. */
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

/** Stage pixel size: live controls while following a preview, else the selected item's recipe, else controls. */
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

/** Left inset when the advanced rail is open; undefined when that rail is hidden. */
export function selectStageInsetLeft(s: StudioStore): string | undefined {
  return selectShowAdvancedRail(s) && s.advancedOpen
    ? SIDE_RAIL_WIDTH
    : undefined
}

/** Right inset when the gallery rail is open; undefined when that rail is hidden. */
export function selectStageInsetRight(s: StudioStore): string | undefined {
  return selectShowGalleryRail(s) && s.galleryOpen ? SIDE_RAIL_WIDTH : undefined
}
