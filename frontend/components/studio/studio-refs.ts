import type {
  GalleryRecipe,
  LoraPack,
  StudioTab,
  ToolsHandoff,
} from "@/lib/host"

/** Non-reactive refs used by store actions + bootstrap (module-scoped). */
export const studioRefs = {
  preferredBlueprintId: null as string | null,
  pendingRecipe: null as GalleryRecipe | null,
  livePreviewSrc: null as string | null,
  pendingPreviewSrc: null as string | null,
  toolsHandoff: null as ToolsHandoff | null,
  aspectId: "1:1",
  sideLength: 1024,
  loraPacks: [] as LoraPack[],
  navigateTab: (() => {}) as (tab: StudioTab) => void,
  pushPath: (() => {}) as (path: string) => void,
}
