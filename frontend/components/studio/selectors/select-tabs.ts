import type { StudioTab } from "@/lib/host"
import { STUDIO_TABS } from "@/components/studio/studio-tabs"
import type { StudioStore } from "../studio-store-types"

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
