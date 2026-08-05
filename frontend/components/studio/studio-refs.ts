import type {
  BlueprintDetail,
  GalleryRecipe,
  LoraPack,
  StudioTab,
  ToolsHandoff,
} from "@/lib/host"
import type { StudioSessionV1 } from "./slices/session-persist"

/** Default noops replaced by bootstrap once navigation is wired. */
export const defaultNavigateTab: (tab: StudioTab) => void = () => {}
export const defaultPushPath: (path: string) => void = () => {}

/** Non-reactive refs used by store actions + bootstrap (module-scoped). */
export const studioRefs = {
  preferredBlueprintId: null as string | null,
  pendingRecipe: null as GalleryRecipe | null,
  /** Restored session waiting for blueprint detail merge (cleared after apply). */
  pendingSession: null as StudioSessionV1 | null,
  /**
   * Per-blueprint control values kept across media-tab switches. When the
   * active blueprint falls back to another tab's model, defaults would
   * otherwise wipe seed/etc; returning restores from here.
   */
  controlValuesByBlueprintId: {} as Record<string, Record<string, unknown>>,
  /**
   * Next `applyLoadedBlueprintDetail` should use blueprint defaults (skip
   * stash / same-id keep). Set by explicit `selectBlueprint` (picker /
   * onboarding) so steps/CFG match the chosen pack.
   */
  forceBlueprintDefaults: false,
  /**
   * Prefetch of blueprint detail started during bootstrap before selectedId
   * is set — reused by the detail-load effect to avoid a second round-trip.
   */
  detailPrefetch: null as null | {
    id: string
    promise: Promise<BlueprintDetail>
  },
  /**
   * Skip SQLite writes until bootstrap `load()` finishes (and pending session
   * detail merge, when any). Starts true so early pathname effects cannot
   * overwrite a saved session with empty defaults.
   */
  suppressSessionPersist: true,
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
