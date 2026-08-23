import type { StudioTab } from "@/lib/host"
import { STUDIO_TABS } from "@/components/studio/studio-tabs"
import type { StudioStore } from "../studio-store-types"

/** Display label for the active studio tab; Image when the tab is unknown. */
export function selectStudioLabel(s: StudioStore): string {
  return STUDIO_TABS.find((tab) => tab.id === s.studioTab)?.label ?? "Image"
}

/** Generate is Image-tab only. */
export function selectCanGenerate(s: StudioStore): boolean {
  return s.studioTab === "image"
}

/** True while the Creator tab is active. */
export function selectShowCreator(s: StudioStore): boolean {
  return s.studioTab === "creator"
}

/** True while the Downloads tab is active. */
export function selectShowDownloads(s: StudioStore): boolean {
  return s.studioTab === "downloads"
}

/** True while the Tools tab is active. */
export function selectShowTools(s: StudioStore): boolean {
  return s.studioTab === "tools"
}

/** True while the Settings tab is active. */
export function selectShowSettings(s: StudioStore): boolean {
  return s.studioTab === "settings"
}

/** Gallery rail is for media tabs only; hidden on Creator, Downloads, Tools, and Settings. */
export function selectShowGalleryRail(s: StudioStore): boolean {
  return (
    !selectShowCreator(s) &&
    !selectShowDownloads(s) &&
    !selectShowTools(s) &&
    !selectShowSettings(s)
  )
}

/** Advanced rail is Image + gallery-rail only. */
export function selectShowAdvancedRail(s: StudioStore): boolean {
  return selectShowGalleryRail(s) && selectCanGenerate(s)
}

/** Bundled tab visibility flags so chrome can subscribe once instead of per selector. */
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

/** Bundled tab flags so chrome can subscribe once. */
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
