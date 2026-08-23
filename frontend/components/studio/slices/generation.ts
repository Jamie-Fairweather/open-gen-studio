import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import { cancelJob, gallerySrc, generateImage } from "@/lib/host"
import { SIDE_LENGTH_DEFAULT, sizeFromAspectAndSide } from "@/lib/image-size"
import { notifyError, notifyInfo } from "@/lib/notify"
import { isInstalled } from "@/lib/blueprint-helpers"
import {
  buildGenerateValues,
  planGenerateLane,
  planGenerateSubmit,
} from "@/lib/generate-lane"
import type { StudioStore } from "../studio-store-types"
import { studioRefs } from "../studio-refs"
import {
  applySet,
  computeActiveSelectedId,
  computeActiveDetail,
  computeTabBlueprints,
} from "./helpers"
import {
  flushPersistImageSession,
  schedulePersistImageSession,
} from "./session-persist"

/** Prompt, size, live preview, and Generate/Cancel for the studio store. */
export type GenerationSlice = {
  prompt: string
  aspectId: string
  sideLength: number
  controlValues: Record<string, unknown>
  generating: boolean
  activeJobId: string | null
  /** Stage follows live preview when true; gallery selection wins when false. */
  followLive: boolean
  livePreviewSrc: string | null
  pendingPreviewSrc: string | null
  genStep: { jobId: string; step: number; max: number } | null
  applySize: (nextAspectId: string, nextSideLength: number) => void
  clearLivePreview: () => void
  queueLivePreview: (path: string) => void
  promotePendingPreview: (loaded: string) => void
  enterFollowLive: () => void
  handleGenerate: () => Promise<void>
  handleCancel: () => Promise<void>
  setPrompt: Dispatch<SetStateAction<string>>
  setControlValues: Dispatch<SetStateAction<Record<string, unknown>>>
  setGenerating: Dispatch<SetStateAction<boolean>>
  setActiveJobId: Dispatch<SetStateAction<string | null>>
  setGenStep: Dispatch<
    SetStateAction<{ jobId: string; step: number; max: number } | null>
  >
  setAspectId: Dispatch<SetStateAction<string>>
  setSideLength: Dispatch<SetStateAction<number>>
}

/** Zustand slice: prompt, size, live preview, and Generate / Cancel. */
export const createGenerationSlice: StateCreator<
  StudioStore,
  [],
  [],
  GenerationSlice
> = (set, get) => {
  studioRefs.aspectId = "1:1"
  studioRefs.sideLength = SIDE_LENGTH_DEFAULT

  return {
    prompt: "",
    aspectId: "1:1",
    sideLength: SIDE_LENGTH_DEFAULT,
    controlValues: {},
    generating: false,
    activeJobId: null,
    followLive: true,
    livePreviewSrc: null,
    pendingPreviewSrc: null,
    genStep: null,

    applySize: (nextAspectId, nextSideLength) => {
      const { width, height } = sizeFromAspectAndSide(
        nextAspectId,
        nextSideLength
      )
      studioRefs.aspectId = nextAspectId
      studioRefs.sideLength = nextSideLength
      set((s) => ({
        aspectId: nextAspectId,
        sideLength: nextSideLength,
        controlValues: { ...s.controlValues, width, height },
      }))
      flushPersistImageSession()
    },

    clearLivePreview: () => {
      studioRefs.livePreviewSrc = null
      studioRefs.pendingPreviewSrc = null
      set({ livePreviewSrc: null, pendingPreviewSrc: null, genStep: null })
    },

    queueLivePreview: (path) => {
      const next = `${gallerySrc(path)}?t=${Date.now()}`
      // Crossfade buffer only while the stage is following live; browsing
      // updates the ghost thumb immediately.
      if (!get().followLive || !studioRefs.livePreviewSrc) {
        studioRefs.livePreviewSrc = next
        studioRefs.pendingPreviewSrc = null
        set({ livePreviewSrc: next, pendingPreviewSrc: null })
        return
      }
      studioRefs.pendingPreviewSrc = next
      set({ pendingPreviewSrc: next })
    },

    promotePendingPreview: (loaded) => {
      studioRefs.livePreviewSrc = loaded
      set({ livePreviewSrc: loaded })
      if (studioRefs.pendingPreviewSrc === loaded) {
        studioRefs.pendingPreviewSrc = null
        set({ pendingPreviewSrc: null })
      }
    },

    enterFollowLive: () => {
      set({ followLive: true })
      flushPersistImageSession()
    },

    handleGenerate: async () => {
      const state = get()
      const tabBlueprints = computeTabBlueprints(
        state.blueprints,
        state.studioTab
      )
      const activeSelectedId = computeActiveSelectedId(
        tabBlueprints,
        state.selectedId
      )
      const selected =
        tabBlueprints.find((bp) => bp.id === activeSelectedId) ?? null
      const submit = planGenerateSubmit({
        catalogReady: state.blueprintsLoaded,
        blueprintId: selected?.id ?? null,
        installed: selected ? isInstalled(selected) : false,
        modelsReady: selected?.modelsReady,
        modelCount: selected?.modelCount,
        prompt: state.prompt,
      })
      if (submit.action === "wait-catalog") {
        notifyInfo(
          "Loading blueprints",
          "Almost ready - try Generate again in a moment.",
          "generate"
        )
        return
      }
      if (submit.action === "pick-blueprint") {
        state.setPickerOpen(true)
        return
      }
      if (submit.action === "install-first") {
        state.setPickerOpen(true)
        notifyInfo(
          "Install models first",
          "Install this blueprint’s models before generating.",
          "generate"
        )
        return
      }
      if (submit.action === "need-prompt") {
        notifyInfo("Prompt required", "Enter a prompt first.", "generate")
        return
      }

      const runningId =
        state.jobQueue.find((i) => i.status === "running")?.jobId ?? null
      const lane = planGenerateLane({
        generating: state.generating,
        runningJobId: runningId,
      })
      // Generate re-enters follow-live; Add to queue leaves browse alone.
      if (lane.followLive) {
        set({ followLive: true })
      }
      state.setGenerating(true)
      // Only reset stage preview/step when starting a fresh lane — queueing
      // while something is already running must not blank the live preview.
      if (lane.action === "start-lane") {
        state.clearLivePreview()
      }
      try {
        const activeDetail = computeActiveDetail(state.detail, activeSelectedId)
        const values = buildGenerateValues({
          prompt: state.prompt,
          controlValues: state.controlValues,
          activeDetail,
          activeArch: activeDetail?.arch ?? null,
          loraStack: state.loraStack,
          loraPacks: state.loraPacks,
          studioTab: state.studioTab,
          upscaleEnabled: state.upscaleEnabled,
          upscaleModelId: state.upscaleModelId,
          usduEnabled: state.usduEnabled,
          usduScale: state.usduScale,
          usduSteps: state.usduSteps,
          usduDenoise: state.usduDenoise,
        })

        const job = await generateImage(submit.blueprintId, values)
        // Cancel / step UI track the GPU lane holder, not the newest enqueue.
        state.setActiveJobId(
          lane.action === "enqueue" ? lane.runningJobId : job.id
        )
        get().acknowledgeQueuedJob(job.id)
      } catch (e) {
        state.setGenerating(false)
        if (lane.action === "start-lane") state.setActiveJobId(null)
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Generation failed"
        )
      }
    },

    handleCancel: async () => {
      const runningId = get().jobQueue.find(
        (i) => i.status === "running"
      )?.jobId
      const jobId = runningId ?? get().activeJobId
      if (!jobId) return
      try {
        await cancelJob(jobId)
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e))
      }
    },

    setPrompt: (next) => {
      set((s) => ({ prompt: applySet(s.prompt, next) }))
      schedulePersistImageSession()
    },

    setControlValues: (next) => {
      set((s) => ({ controlValues: applySet(s.controlValues, next) }))
      schedulePersistImageSession()
    },

    setGenerating: (next) =>
      set((s) => ({ generating: applySet(s.generating, next) })),

    setActiveJobId: (next) =>
      set((s) => ({ activeJobId: applySet(s.activeJobId, next) })),

    setGenStep: (next) => set((s) => ({ genStep: applySet(s.genStep, next) })),

    setAspectId: (next) => {
      set((s) => {
        const aspectId = applySet(s.aspectId, next)
        studioRefs.aspectId = aspectId
        return { aspectId }
      })
      schedulePersistImageSession()
    },

    setSideLength: (next) => {
      set((s) => {
        const sideLength = applySet(s.sideLength, next)
        studioRefs.sideLength = sideLength
        return { sideLength }
      })
      schedulePersistImageSession()
    },
  }
}
