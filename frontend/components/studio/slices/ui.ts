import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  gallerySrc,
  type JobQueueItem,
  type StudioTab,
  type ToolsHandoff,
} from "@/lib/host"
import { SIDE_RAIL_WIDTH } from "@/components/side-rail"
import type { StudioStore } from "../studio-store-types"
import { studioRefs } from "../studio-refs"
import { applySet } from "./helpers"

export type UiSlice = {
  desktop: boolean
  studioTab: StudioTab
  pickerOpen: boolean
  editBlueprintId: string | null
  settingsOpen: boolean
  modelsOpen: boolean
  loraPickerOpen: boolean
  galleryOpen: boolean
  advancedOpen: boolean
  toolsHandoff: ToolsHandoff | null
  jobQueue: JobQueueItem[]
  navigateTab: (tab: StudioTab) => void
  setDesktop: Dispatch<SetStateAction<boolean>>
  setStudioTab: Dispatch<SetStateAction<StudioTab>>
  setPickerOpen: Dispatch<SetStateAction<boolean>>
  setEditBlueprintId: Dispatch<SetStateAction<string | null>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setModelsOpen: Dispatch<SetStateAction<boolean>>
  setLoraPickerOpen: Dispatch<SetStateAction<boolean>>
  setGalleryOpen: Dispatch<SetStateAction<boolean>>
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
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
  settingsOpen: false,
  modelsOpen: false,
  loraPickerOpen: false,
  galleryOpen: false,
  advancedOpen: false,
  toolsHandoff: null,
  jobQueue: [],

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
  setSettingsOpen: (next) =>
    set((s) => ({ settingsOpen: applySet(s.settingsOpen, next) })),
  setModelsOpen: (next) =>
    set((s) => ({ modelsOpen: applySet(s.modelsOpen, next) })),
  setLoraPickerOpen: (next) =>
    set((s) => ({ loraPickerOpen: applySet(s.loraPickerOpen, next) })),
  setGalleryOpen: (next) =>
    set((s) => ({ galleryOpen: applySet(s.galleryOpen, next) })),
  setAdvancedOpen: (next) =>
    set((s) => ({ advancedOpen: applySet(s.advancedOpen, next) })),

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
