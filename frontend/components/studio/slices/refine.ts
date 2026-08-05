import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  ensureDownload,
  providerTokenStatus,
  uninstallLoraVariant,
  type LoraStackEntry,
} from "@/lib/host"
import type { RecipeArch } from "@/lib/arch"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet, DEFAULT_UPSCALE_MODEL_ID } from "./helpers"
import { flushPersistSession } from "./session-persist"

export type RefineSlice = {
  loraStack: LoraStackEntry[]
  upscaleEnabled: boolean
  upscaleModelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  usduSteps: number
  usduDenoise: number
  /** Optimistic: ids clicked for install before Downloads snapshot catches up. */
  pendingUpscaleIds: string[]
  setLoraStack: Dispatch<SetStateAction<LoraStackEntry[]>>
  setUpscaleEnabled: Dispatch<SetStateAction<boolean>>
  setUpscaleModelId: Dispatch<SetStateAction<string>>
  setUsduEnabled: Dispatch<SetStateAction<boolean>>
  setUsduScale: Dispatch<SetStateAction<2 | 4>>
  setUsduSteps: Dispatch<SetStateAction<number>>
  setUsduDenoise: Dispatch<SetStateAction<number>>
  beginLoraInstall: (id: string, arch: RecipeArch) => Promise<void>
  beginLoraUninstall: (id: string, arch: RecipeArch) => Promise<void>
  beginUpscaleInstall: (id: string) => Promise<void>
  beginUsduInstall: () => Promise<void>
  beginPromptToolsInstall: (provider?: string) => Promise<void>
}

export const createRefineSlice: StateCreator<
  StudioStore,
  [],
  [],
  RefineSlice
> = (set, get) => ({
  loraStack: [],
  upscaleEnabled: false,
  upscaleModelId: DEFAULT_UPSCALE_MODEL_ID,
  usduEnabled: false,
  usduScale: 2,
  usduSteps: 8,
  usduDenoise: 0.15,
  pendingUpscaleIds: [],

  setLoraStack: (next) => {
    set((s) => ({ loraStack: applySet(s.loraStack, next) }))
    flushPersistSession()
  },
  setUpscaleEnabled: (next) => {
    set((s) => ({ upscaleEnabled: applySet(s.upscaleEnabled, next) }))
    flushPersistSession()
  },
  setUpscaleModelId: (next) => {
    set((s) => ({ upscaleModelId: applySet(s.upscaleModelId, next) }))
    flushPersistSession()
  },
  setUsduEnabled: (next) => {
    set((s) => ({ usduEnabled: applySet(s.usduEnabled, next) }))
    flushPersistSession()
  },
  setUsduScale: (next) => {
    set((s) => ({ usduScale: applySet(s.usduScale, next) }))
    flushPersistSession()
  },
  setUsduSteps: (next) => {
    set((s) => ({ usduSteps: applySet(s.usduSteps, next) }))
    flushPersistSession()
  },
  setUsduDenoise: (next) => {
    set((s) => ({ usduDenoise: applySet(s.usduDenoise, next) }))
    flushPersistSession()
  },

  beginLoraInstall: async (id, arch) => {
    try {
      const loraPacks = get().loraPacks
      const pack = loraPacks.find((p) => p.id === id)
      const variant = pack?.variants.find((v) => v.arch === arch)
      const url = (variant?.url ?? "").toLowerCase()
      if (url.includes("civitai.com") || url.includes("civitai.red")) {
        const status = await providerTokenStatus()
        get().setHasCivitaiToken(status.civitai)
        if (!status.civitai) {
          get().setPendingLoraInstall({ id, arch })
          get().setCivitaiTokenDialogOpen(true)
          return
        }
      }
      await ensureDownload({ kind: "lora", id, arch }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "LoRA install failed"
      )
    }
  },

  beginLoraUninstall: async (id, arch) => {
    try {
      const summary = await uninstallLoraVariant(id, arch)
      const name = get().loraPacks.find((p) => p.id === id)?.name ?? id
      const detail =
        summary.kept > 0
          ? `Removed ${summary.removed} file(s); kept ${summary.kept} shared`
          : `Removed ${summary.removed} file(s)`
      notifySuccess(name, detail)
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "LoRA uninstall failed"
      )
    }
  },

  beginUpscaleInstall: async (id) => {
    set((s) => ({
      pendingUpscaleIds: s.pendingUpscaleIds.includes(id)
        ? s.pendingUpscaleIds
        : [...s.pendingUpscaleIds, id],
    }))
    try {
      const result = await ensureDownload(
        { kind: "upscale", id },
        { wait: false }
      )
      // Already installed / no job → drop optimistic pending (snapshot won't clear it).
      if (result.status === "ready" || !result.jobId) {
        set((s) => ({
          pendingUpscaleIds: s.pendingUpscaleIds.filter((x) => x !== id),
        }))
      }
    } catch (e) {
      set((s) => ({
        pendingUpscaleIds: s.pendingUpscaleIds.filter((x) => x !== id),
      }))
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Upscale install failed"
      )
    }
  },

  beginUsduInstall: async () => {
    await get().beginUpscaleInstall("usdu")
  },

  beginPromptToolsInstall: async (provider = "qwenvl") => {
    try {
      await ensureDownload({ kind: "promptTools", provider }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Prompt Tools install failed"
      )
    }
  },
})
