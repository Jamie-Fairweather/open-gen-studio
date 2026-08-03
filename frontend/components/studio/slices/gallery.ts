import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  deleteGalleryItem,
  parseGalleryRecipe,
  type GalleryItem,
} from "@/lib/host"
import {
  applyReuseAllSettings,
  lorasFromRecipe,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import { syncSizeControls } from "@/lib/image-size"
import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { studioRefs } from "../studio-refs"
import {
  applySet,
  computeActiveDetail,
  computeActiveSelectedId,
  computeTabBlueprints,
} from "./helpers"

export type GallerySlice = {
  gallery: GalleryItem[]
  selectedGalleryId: string | null
  setGallery: Dispatch<SetStateAction<GalleryItem[]>>
  setSelectedGalleryId: Dispatch<SetStateAction<string | null>>
  /** Select a real gallery item and leave follow-live stage mode. */
  selectGalleryItem: (id: string | null) => void
  /** Insert result and drop live preview in one update so Live never overlaps it. */
  ingestGalleryItem: (item: GalleryItem) => void
  handleDeleteGalleryItem: (id: string) => Promise<void>
  handleReuseGalleryPrompt: (item: GalleryItem) => void
  handleReuseGallerySettings: (item: GalleryItem) => void
}

export const createGallerySlice: StateCreator<
  StudioStore,
  [],
  [],
  GallerySlice
> = (set, get) => ({
  gallery: [],
  selectedGalleryId: null,

  setGallery: (next) => set((s) => ({ gallery: applySet(s.gallery, next) })),

  setSelectedGalleryId: (next) =>
    set((s) => ({ selectedGalleryId: applySet(s.selectedGalleryId, next) })),

  selectGalleryItem: (id) => set({ selectedGalleryId: id, followLive: false }),

  ingestGalleryItem: (item) => {
    studioRefs.livePreviewSrc = null
    studioRefs.pendingPreviewSrc = null
    set((s) => {
      const gallery = s.gallery.some((x) => x.id === item.id)
        ? s.gallery
        : [item, ...s.gallery]
      return {
        gallery,
        selectedGalleryId: s.followLive ? item.id : s.selectedGalleryId,
        livePreviewSrc: null,
        pendingPreviewSrc: null,
        genStep: null,
      }
    })
  },

  handleDeleteGalleryItem: async (id) => {
    const prev = get().gallery
    const selectedWas = get().selectedGalleryId
    // Drop from UI immediately; disk cleanup finishes in the background.
    set({
      gallery: prev.filter((item) => item.id !== id),
      selectedGalleryId: selectedWas === id ? null : selectedWas,
    })
    try {
      await deleteGalleryItem(id)
      notifySuccess("Image deleted")
    } catch (e) {
      set({
        gallery: prev,
        selectedGalleryId: selectedWas,
      })
      notifyError(e instanceof Error ? e.message : String(e), "Delete failed")
      throw e
    }
  },

  handleReuseGalleryPrompt: (item) => {
    const recipe = parseGalleryRecipe(item)
    if (!recipe?.prompt) {
      notifyInfo("No prompt", "This image has no reusable prompt.", "reuse")
      return
    }
    set({ selectedGalleryId: item.id, followLive: false })
    get().setPrompt(recipe.prompt)
    notifySuccess("Prompt loaded", "From gallery image")
  },

  handleReuseGallerySettings: (item) => {
    const recipe = parseGalleryRecipe(item)
    if (!recipe) {
      notifyInfo("No settings", "This image has no reusable settings.", "reuse")
      return
    }

    const state = get()
    state.navigateTab(recipe.category)
    set({ selectedGalleryId: item.id, followLive: false })

    if (recipe.prompt) {
      state.setPrompt(recipe.prompt)
    }

    const width = Number(recipe.values.width)
    const height = Number(recipe.values.height)
    if (Number.isFinite(width) && Number.isFinite(height)) {
      const synced = syncSizeControls(width, height)
      state.setAspectId(synced.aspectId)
      state.setSideLength(synced.sideLength)
    }

    const tabBlueprints = computeTabBlueprints(
      state.blueprints,
      state.studioTab
    )
    const activeSelectedId = computeActiveSelectedId(
      tabBlueprints,
      state.selectedId
    )
    const activeDetail = computeActiveDetail(state.detail, activeSelectedId)
    const activeArch = activeDetail?.arch ?? null

    const applyUpscale = (arch?: string | null) => {
      const up = upscaleFromRecipe(recipe, arch)
      state.setUpscaleEnabled(up.enabled)
      state.setUpscaleModelId(up.modelId)
      state.setUsduEnabled(up.usduEnabled)
      state.setUsduScale(up.usduScale)
      state.setUsduSteps(up.usduSteps)
      state.setUsduDenoise(up.usduDenoise)
    }

    if (recipe.blueprintId) {
      if (
        recipe.blueprintId === activeSelectedId &&
        activeDetail?.id === recipe.blueprintId
      ) {
        const defaults: Record<string, unknown> = {}
        for (const c of activeDetail.controls) {
          if (c.default !== undefined) defaults[c.id] = c.default
        }
        state.setControlValues(applyReuseAllSettings(defaults, recipe))
        state.setLoraStack(lorasFromRecipe(recipe, state.loraPacks))
        applyUpscale(activeDetail.arch)
      } else {
        studioRefs.pendingRecipe = recipe
        state.selectBlueprint(recipe.blueprintId)
      }
    } else {
      state.setControlValues((prev) => applyReuseAllSettings(prev, recipe))
      state.setLoraStack(lorasFromRecipe(recipe, state.loraPacks))
      applyUpscale(activeArch)
    }

    notifySuccess(
      "Settings loaded",
      recipe.blueprintName
        ? `From ${recipe.blueprintName}`
        : "From gallery image"
    )
  },
})
