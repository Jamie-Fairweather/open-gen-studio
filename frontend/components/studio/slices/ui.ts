import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  gallerySrc,
  setSetting,
  type JobQueueItem,
  type StudioTab,
  type ToolsHandoff,
} from "@/lib/host"
import { SIDE_RAIL_WIDTH } from "@/components/shell/side-rail"
import type { StudioStore } from "../studio-store-types"
import { studioRefs } from "../studio-refs"
import {
  applySet,
  SETTING_ADVANCED_OPEN,
  SETTING_GALLERY_OPEN,
} from "./helpers"

function persistBool(key: string, value: boolean) {
  void setSetting(key, value ? "1" : "0").catch(() => {})
}

const FRESH_CHIP_MS = 2000
let freshChipTimer: ReturnType<typeof setTimeout> | null = null

export type UiSlice = {
  desktop: boolean
  studioTab: StudioTab
  pickerOpen: boolean
  editBlueprintId: string | null
  gpuVendorDialogOpen: boolean
  modelsOpen: boolean
  loraPickerOpen: boolean
  galleryOpen: boolean
  advancedOpen: boolean
  queueExpandOpen: boolean
  /**
   * True once bootstrap has restored settings/session (and catalog) so the
   * startup overlay can dismiss without flashing empty defaults.
   */
  startupHydrated: boolean
  /** Bumps on successful enqueue — prompt bar expose feedback. */
  queuePulseToken: number
  /** Job id that just landed on the lane (chip entrance). */
  lastQueuedJobId: string | null
  toolsHandoff: ToolsHandoff | null
  jobQueue: JobQueueItem[]
  navigateTab: (tab: StudioTab) => void
  /** Pulse chrome after a successful enqueue. */
  acknowledgeQueuedJob: (jobId: string) => void
  setDesktop: Dispatch<SetStateAction<boolean>>
  setStudioTab: Dispatch<SetStateAction<StudioTab>>
  setPickerOpen: Dispatch<SetStateAction<boolean>>
  setEditBlueprintId: Dispatch<SetStateAction<string | null>>
  setGpuVendorDialogOpen: Dispatch<SetStateAction<boolean>>
  setModelsOpen: Dispatch<SetStateAction<boolean>>
  setLoraPickerOpen: Dispatch<SetStateAction<boolean>>
  setGalleryOpen: Dispatch<SetStateAction<boolean>>
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
  setQueueExpandOpen: Dispatch<SetStateAction<boolean>>
  setStartupHydrated: Dispatch<SetStateAction<boolean>>
  setToolsHandoff: Dispatch<SetStateAction<ToolsHandoff | null>>
  setJobQueue: Dispatch<SetStateAction<JobQueueItem[]>>
  /** Read and clear handoff (call once on tool page mount). */
  consumeToolsHandoff: () => ToolsHandoff | null
  openImageToPrompt: (handoff?: ToolsHandoff) => void
  openPromptEnhancer: (handoff?: ToolsHandoff) => void
  gallerySrc: typeof gallerySrc
  SIDE_RAIL_WIDTH: typeof SIDE_RAIL_WIDTH
}

export const createUiSlice: StateCreator<StudioStore, [], [], UiSlice> = (
  set,
  get
) => ({
  // Server + hydration assume desktop (Tauri-first) so SSR HTML matches the shell;
  // bootstrap flips this after hydrate when running outside Tauri.
  desktop: true,
  studioTab: "image",
  pickerOpen: false,
  editBlueprintId: null,
  gpuVendorDialogOpen: false,
  modelsOpen: false,
  loraPickerOpen: false,
  galleryOpen: false,
  advancedOpen: false,
  queueExpandOpen: false,
  startupHydrated: false,
  queuePulseToken: 0,
  lastQueuedJobId: null,
  toolsHandoff: null,
  jobQueue: [],

  acknowledgeQueuedJob: (jobId) => {
    if (freshChipTimer) clearTimeout(freshChipTimer)
    set((s) => ({
      queuePulseToken: s.queuePulseToken + 1,
      lastQueuedJobId: jobId,
    }))
    freshChipTimer = setTimeout(() => {
      freshChipTimer = null
      set((s) => (s.lastQueuedJobId === jobId ? { lastQueuedJobId: null } : {}))
    }, FRESH_CHIP_MS)
  },

  navigateTab: (tab) => {
    studioRefs.navigateTab(tab)
  },

  setDesktop: (next) => set((s) => ({ desktop: applySet(s.desktop, next) })),
  setStudioTab: (next) =>
    set((s) => ({ studioTab: applySet(s.studioTab, next) })),
  setPickerOpen: (next) =>
    set((s) => ({ pickerOpen: applySet(s.pickerOpen, next) })),
  setEditBlueprintId: (next) =>
    set((s) => ({ editBlueprintId: applySet(s.editBlueprintId, next) })),
  setGpuVendorDialogOpen: (next) =>
    set((s) => ({
      gpuVendorDialogOpen: applySet(s.gpuVendorDialogOpen, next),
    })),
  setModelsOpen: (next) =>
    set((s) => ({ modelsOpen: applySet(s.modelsOpen, next) })),
  setLoraPickerOpen: (next) =>
    set((s) => ({ loraPickerOpen: applySet(s.loraPickerOpen, next) })),
  setGalleryOpen: (next) =>
    set((s) => {
      const galleryOpen = applySet(s.galleryOpen, next)
      persistBool(SETTING_GALLERY_OPEN, galleryOpen)
      return { galleryOpen }
    }),
  setAdvancedOpen: (next) =>
    set((s) => {
      const advancedOpen = applySet(s.advancedOpen, next)
      persistBool(SETTING_ADVANCED_OPEN, advancedOpen)
      return { advancedOpen }
    }),
  setQueueExpandOpen: (next) =>
    set((s) => ({ queueExpandOpen: applySet(s.queueExpandOpen, next) })),

  setStartupHydrated: (next) =>
    set((s) => ({ startupHydrated: applySet(s.startupHydrated, next) })),

  setToolsHandoff: (next) =>
    set((s) => {
      const toolsHandoff = applySet(s.toolsHandoff, next)
      studioRefs.toolsHandoff = toolsHandoff
      return { toolsHandoff }
    }),

  setJobQueue: (next) => set((s) => ({ jobQueue: applySet(s.jobQueue, next) })),

  consumeToolsHandoff: () => {
    const current = studioRefs.toolsHandoff
    if (current) {
      studioRefs.toolsHandoff = null
      set({ toolsHandoff: null })
    }
    return current
  },

  openImageToPrompt: (handoff) => {
    if (handoff) {
      studioRefs.toolsHandoff = handoff
      set({ toolsHandoff: handoff })
    }
    studioRefs.pushPath("/tools/image-to-prompt")
  },

  openPromptEnhancer: (handoff) => {
    if (handoff?.prompt != null) {
      // Apply immediately — panel only seeds once on mount, so revisits
      // must not rely on toolsHandoff alone.
      get().seedPromptEnhance(handoff.prompt)
    } else if (handoff) {
      studioRefs.toolsHandoff = handoff
      set({ toolsHandoff: handoff })
    }
    studioRefs.pushPath("/tools/prompt-enhancer")
  },

  gallerySrc,
  SIDE_RAIL_WIDTH,
})
