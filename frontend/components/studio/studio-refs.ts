import type { LoraPack, StudioTab, ToolsHandoff } from "@/lib/host"

/** Default noops replaced by bootstrap once navigation is wired. */
export const defaultNavigateTab: (tab: StudioTab) => void = () => {}
export const defaultPushPath: (path: string) => void = () => {}

/** Non-reactive refs used by store actions + bootstrap (module-scoped). */
export const studioRefs = {
  /** LoRA/upscale catalog hydrate finished (or failed) during bootstrap. */
  startupCatalogReady: false,
  livePreviewSrc: null as string | null,
  pendingPreviewSrc: null as string | null,
  toolsHandoff: null as ToolsHandoff | null,
  aspectId: "1:1",
  sideLength: 1024,
  loraPacks: [] as LoraPack[],
  navigateTab: defaultNavigateTab as (tab: StudioTab) => void,
  pushPath: defaultPushPath as (path: string) => void,
}
