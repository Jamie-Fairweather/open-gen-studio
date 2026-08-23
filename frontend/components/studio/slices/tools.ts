import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  cancelJob,
  isTauri,
  runImageToPrompt,
  runPromptEnhance,
  type JobProgress,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
  enhanceModePayload,
  flattenStructuredFields,
  parseStructuredPrompt,
  targetFromArch,
  type PromptFormatId,
  type PromptTargetId,
  type StructuredFields,
  emptyStructuredFields,
} from "@/lib/prompt-tools"
import type { StudioStore } from "../studio-store-types"
import {
  applySet,
  computeActiveDetail,
  computeActiveSelectedId,
  computeTabBlueprints,
} from "./helpers"
import {
  flushPersistToolsSession,
  schedulePersistToolsSession,
} from "./session-persist"

/** Draft + job state for Image-to-Prompt; `fields` is set only for structured formats. */
export type ImageToPromptToolState = {
  imagePath: string | null
  previewUrl: string | null
  format: PromptFormatId
  target: PromptTargetId
  result: string
  negative: string | null
  fields: StructuredFields | null
  busy: boolean
  status: string | null
  error: string | null
  jobId: string | null
  galleryOpen: boolean
}

/** Draft + job state for Prompt Enhance; `seeded` marks a studio Enhance handoff. */
export type PromptEnhanceToolState = {
  input: string
  result: string
  negative: string | null
  target: PromptTargetId
  mode: string
  styleLook: string
  busy: boolean
  status: string | null
  error: string | null
  jobId: string | null
  seeded: boolean
}

/** Image-to-Prompt and Prompt Enhance job state for the studio store. */
export type ToolsSlice = {
  imageToPrompt: ImageToPromptToolState
  promptEnhance: PromptEnhanceToolState
  patchImageToPrompt: (patch: Partial<ImageToPromptToolState>) => void
  patchPromptEnhance: (patch: Partial<PromptEnhanceToolState>) => void
  setImageToPrompt: Dispatch<SetStateAction<ImageToPromptToolState>>
  setPromptEnhance: Dispatch<SetStateAction<PromptEnhanceToolState>>
  /** Fresh session from studio Enhance — clears prior result and seeds input. */
  seedPromptEnhance: (prompt: string) => void
  runImageToPromptTool: () => Promise<void>
  runPromptEnhanceTool: () => Promise<void>
  cancelImageToPromptTool: () => Promise<void>
  cancelPromptEnhanceTool: () => Promise<void>
  handleToolJobProgress: (p: JobProgress) => boolean
  handlePromptToolsStatus: (message: string) => void
}

const initialImageToPrompt = (): ImageToPromptToolState => ({
  imagePath: null,
  previewUrl: null,
  format: "general",
  target: "auto",
  result: "",
  negative: null,
  fields: null,
  busy: false,
  status: null,
  error: null,
  jobId: null,
  galleryOpen: false,
})

const initialPromptEnhance = (): PromptEnhanceToolState => ({
  input: "",
  result: "",
  negative: null,
  target: "auto",
  mode: "expand",
  styleLook: "cinematic",
  busy: false,
  status: null,
  error: null,
  jobId: null,
  seeded: false,
})

function applyResultText(
  text: string,
  format: PromptFormatId
): Pick<ImageToPromptToolState, "result" | "fields"> {
  if (
    format === "structured" ||
    format === "json" ||
    format === "graphicDesign"
  ) {
    return { result: text, fields: parseStructuredPrompt(text) }
  }
  return { result: text, fields: null }
}

/** Flatten structured Image-to-Prompt fields for display; otherwise the raw result text. */
export function displayImageToPrompt(state: ImageToPromptToolState): string {
  if (
    state.fields &&
    (state.format === "structured" || state.format === "json")
  ) {
    return flattenStructuredFields(state.fields)
  }
  return state.result
}

export { emptyStructuredFields }

function activeArchOf(get: () => StudioStore): string | undefined {
  const state = get()
  const tabBlueprints = computeTabBlueprints(state.blueprints, state.studioTab)
  const activeSelectedId = computeActiveSelectedId(
    tabBlueprints,
    state.selectedId
  )
  return computeActiveDetail(state.detail, activeSelectedId)?.arch
}

/** Zustand slice: Image-to-Prompt and Prompt Enhance jobs, plus their progress routing. */
export const createToolsSlice: StateCreator<StudioStore, [], [], ToolsSlice> = (
  set,
  get
) => ({
  imageToPrompt: initialImageToPrompt(),
  promptEnhance: initialPromptEnhance(),

  patchImageToPrompt: (patch) => {
    set((s) => ({ imageToPrompt: { ...s.imageToPrompt, ...patch } }))
    schedulePersistToolsSession()
  },

  patchPromptEnhance: (patch) => {
    set((s) => ({ promptEnhance: { ...s.promptEnhance, ...patch } }))
    schedulePersistToolsSession()
  },

  setImageToPrompt: (next) => {
    set((s) => ({ imageToPrompt: applySet(s.imageToPrompt, next) }))
    schedulePersistToolsSession()
  },
  setPromptEnhance: (next) => {
    set((s) => ({ promptEnhance: applySet(s.promptEnhance, next) }))
    schedulePersistToolsSession()
  },

  seedPromptEnhance: (prompt) => {
    const cur = get().promptEnhance
    if (cur.busy && cur.jobId) {
      void cancelJob(cur.jobId)
    }
    const arch = activeArchOf(get)
    set({
      promptEnhance: {
        ...initialPromptEnhance(),
        input: prompt.trim(),
        seeded: true,
        target: arch ? targetFromArch(arch) : "auto",
      },
    })
    flushPersistToolsSession()
  },

  handlePromptToolsStatus: (message) => {
    const { imageToPrompt, promptEnhance } = get()
    if (imageToPrompt.busy) {
      set({ imageToPrompt: { ...imageToPrompt, status: message } })
    } else if (promptEnhance.busy) {
      set({ promptEnhance: { ...promptEnhance, status: message } })
    }
  },

  /** Returns true when the event belonged to a Prompt Tool job. */
  handleToolJobProgress: (p) => {
    const { imageToPrompt, promptEnhance } = get()

    if (imageToPrompt.jobId === p.jobId) {
      if (p.message && p.stage !== "done" && p.stage !== "error") {
        set({ imageToPrompt: { ...get().imageToPrompt, status: p.message } })
      }
      if (p.stage === "done") {
        const text = p.result?.prompt ?? p.text ?? ""
        const cur = get().imageToPrompt
        if (!text) {
          set({
            imageToPrompt: {
              ...cur,
              busy: false,
              jobId: null,
              status: null,
              error: "No prompt returned",
            },
          })
          notifyError("No prompt returned")
          return true
        }
        const applied = applyResultText(text, cur.format)
        set({
          imageToPrompt: {
            ...cur,
            ...applied,
            negative: p.result?.negative ?? null,
            busy: false,
            jobId: null,
            status: null,
            error: null,
          },
        })
        flushPersistToolsSession()
        notifySuccess("Prompt ready")
      } else if (p.stage === "error") {
        const msg = p.message || "Prompt tool failed"
        set({
          imageToPrompt: {
            ...get().imageToPrompt,
            busy: false,
            jobId: null,
            status: null,
            error: msg,
          },
        })
        notifyError(msg)
      } else if (p.stage === "cancelled") {
        set({
          imageToPrompt: {
            ...get().imageToPrompt,
            busy: false,
            jobId: null,
            status: null,
            error: null,
          },
        })
      }
      return true
    }

    if (promptEnhance.jobId === p.jobId) {
      if (p.message && p.stage !== "done" && p.stage !== "error") {
        set({ promptEnhance: { ...get().promptEnhance, status: p.message } })
      }
      if (p.stage === "done") {
        const text = p.result?.prompt ?? p.text ?? ""
        if (!text) {
          set({
            promptEnhance: {
              ...get().promptEnhance,
              busy: false,
              jobId: null,
              status: null,
              error: "No prompt returned",
            },
          })
          notifyError("No prompt returned")
          return true
        }
        set({
          promptEnhance: {
            ...get().promptEnhance,
            result: text,
            negative: p.result?.negative ?? null,
            busy: false,
            jobId: null,
            status: null,
            error: null,
          },
        })
        flushPersistToolsSession()
        notifySuccess("Enhanced prompt ready")
      } else if (p.stage === "error") {
        const msg = p.message || "Enhance failed"
        set({
          promptEnhance: {
            ...get().promptEnhance,
            busy: false,
            jobId: null,
            status: null,
            error: msg,
          },
        })
        notifyError(msg)
      } else if (p.stage === "cancelled") {
        set({
          promptEnhance: {
            ...get().promptEnhance,
            busy: false,
            jobId: null,
            status: null,
            error: null,
          },
        })
      }
      return true
    }

    return false
  },

  runImageToPromptTool: async () => {
    const cur = get().imageToPrompt
    if (cur.busy) return
    if (!cur.imagePath) {
      set({ imageToPrompt: { ...cur, error: "Choose an image first." } })
      return
    }
    if (!isTauri()) {
      set({
        imageToPrompt: {
          ...cur,
          error: "Prompt Tools require the desktop app.",
        },
      })
      return
    }

    set({
      imageToPrompt: {
        ...cur,
        busy: true,
        error: null,
        status: "Queued…",
      },
    })

    try {
      const job = await runImageToPrompt({
        imagePath: cur.imagePath,
        format: cur.format,
        target: cur.target,
        arch: activeArchOf(get),
      })
      set({
        imageToPrompt: {
          ...get().imageToPrompt,
          jobId: job.id,
          status: "Waiting in queue…",
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({
        imageToPrompt: {
          ...get().imageToPrompt,
          busy: false,
          jobId: null,
          status: null,
          error: msg,
        },
      })
      notifyError(msg)
    }
  },

  runPromptEnhanceTool: async () => {
    const cur = get().promptEnhance
    if (cur.busy) return
    const prompt = cur.input.trim()
    if (!prompt) {
      set({ promptEnhance: { ...cur, error: "Enter a prompt to enhance." } })
      return
    }
    if (!isTauri()) {
      set({
        promptEnhance: {
          ...cur,
          error: "Prompt Tools require the desktop app.",
        },
      })
      return
    }

    set({
      promptEnhance: {
        ...cur,
        busy: true,
        error: null,
        status: "Queued…",
      },
    })

    try {
      const job = await runPromptEnhance({
        prompt,
        target: cur.target,
        arch: activeArchOf(get),
        mode: enhanceModePayload(cur.mode, cur.styleLook),
      })
      set({
        promptEnhance: {
          ...get().promptEnhance,
          jobId: job.id,
          status: "Waiting in queue…",
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({
        promptEnhance: {
          ...get().promptEnhance,
          busy: false,
          jobId: null,
          status: null,
          error: msg,
        },
      })
      notifyError(msg)
    }
  },

  cancelImageToPromptTool: async () => {
    const id = get().imageToPrompt.jobId
    if (id) await cancelJob(id)
  },

  cancelPromptEnhanceTool: async () => {
    const id = get().promptEnhance.jobId
    if (id) await cancelJob(id)
  },
})
