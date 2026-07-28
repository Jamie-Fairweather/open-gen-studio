import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import { ensureDownload, listSettings, type LoraStackEntry } from "@/lib/host"
import type { RecipeArch } from "@/lib/arch"
import { notifyError } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet, DEFAULT_UPSCALE_MODEL_ID } from "./helpers"

export type RefineSlice = {
  loraStack: LoraStackEntry[]
  upscaleEnabled: boolean
  upscaleModelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  usduSteps: number
  usduDenoise: number
  setLoraStack: Dispatch<SetStateAction<LoraStackEntry[]>>
  setUpscaleEnabled: Dispatch<SetStateAction<boolean>>
  setUpscaleModelId: Dispatch<SetStateAction<string>>
  setUsduEnabled: Dispatch<SetStateAction<boolean>>
  setUsduScale: Dispatch<SetStateAction<2 | 4>>
  setUsduSteps: Dispatch<SetStateAction<number>>
  setUsduDenoise: Dispatch<SetStateAction<number>>
  beginLoraInstall: (id: string, arch: RecipeArch) => Promise<void>
  beginUpscaleInstall: (id: string) => Promise<void>
  beginUsduInstall: () => Promise<void>
  beginPromptToolsInstall: () => Promise<void>
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

  setLoraStack: (next) =>
    set((s) => ({ loraStack: applySet(s.loraStack, next) })),
  setUpscaleEnabled: (next) =>
    set((s) => ({ upscaleEnabled: applySet(s.upscaleEnabled, next) })),
  setUpscaleModelId: (next) =>
    set((s) => ({ upscaleModelId: applySet(s.upscaleModelId, next) })),
  setUsduEnabled: (next) =>
    set((s) => ({ usduEnabled: applySet(s.usduEnabled, next) })),
  setUsduScale: (next) =>
    set((s) => ({ usduScale: applySet(s.usduScale, next) })),
  setUsduSteps: (next) =>
    set((s) => ({ usduSteps: applySet(s.usduSteps, next) })),
  setUsduDenoise: (next) =>
    set((s) => ({ usduDenoise: applySet(s.usduDenoise, next) })),

  beginLoraInstall: async (id, arch) => {
    try {
      const loraPacks = get().loraPacks
      const pack = loraPacks.find((p) => p.id === id)
      const variant = pack?.variants.find((v) => v.arch === arch)
      const url = (variant?.url ?? "").toLowerCase()
      if (url.includes("civitai.com") || url.includes("civitai.red")) {
        const settings = await listSettings()
        if (!(settings.civitai_api_key ?? "").trim()) {
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

  beginUpscaleInstall: async (id) => {
    try {
      await ensureDownload({ kind: "upscale", id }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Upscale install failed"
      )
    }
  },

  beginUsduInstall: async () => {
    await get().beginUpscaleInstall("usdu")
  },

  beginPromptToolsInstall: async () => {
    try {
      await ensureDownload(
        { kind: "promptTools", provider: "qwenvl" },
        { wait: false }
      )
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Prompt Tools install failed"
      )
    }
  },
})
