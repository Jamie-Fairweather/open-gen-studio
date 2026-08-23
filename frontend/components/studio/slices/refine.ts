import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  addPendingUpscaleId,
  catalogGatePatch,
  dropPendingUpscaleId,
  planCatalogInstall,
  startCatalogInstall,
  uninstallToastDescription,
} from "@/lib/catalog-install"
import {
  ensureDownload,
  installComfyui,
  providerTokenStatus,
  uninstallLoraVariant,
  type LoraStackEntry,
} from "@/lib/host"
import type { RecipeArch } from "@/lib/arch"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet, DEFAULT_UPSCALE_MODEL_ID } from "./helpers"
import { flushPersistSession } from "./session-persist"

const catalogHost = {
  ensureDownload,
  installRuntime: installComfyui,
}

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
      const pack = get().loraPacks.find((p) => p.id === id)
      const variant = pack?.variants.find((v) => v.arch === arch)
      const status = await providerTokenStatus()
      get().setHasCivitaiToken(status.civitai)
      const plan = await planCatalogInstall({
        row: { kind: "lora", id, arch },
        tokens: {
          huggingface: get().hasHfToken,
          civitai: status.civitai,
        },
        gatedTermsAcked: true,
        loraUrl: variant?.url ?? "",
      })
      if (plan.action === "gate") {
        set(catalogGatePatch(plan.need, { kind: "lora", id, arch }))
        return
      }
      await startCatalogInstall({ kind: "lora", id, arch }, catalogHost)
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
      notifySuccess(name, uninstallToastDescription(summary))
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "LoRA uninstall failed"
      )
    }
  },

  beginUpscaleInstall: async (id) => {
    set((s) => ({
      pendingUpscaleIds: addPendingUpscaleId(s.pendingUpscaleIds, id),
    }))
    try {
      const result = await startCatalogInstall(
        { kind: "upscale", id },
        catalogHost
      )
      // Already installed / no job → drop optimistic pending (snapshot won't clear it).
      if (result.status === "ready" || !result.jobId) {
        set((s) => ({
          pendingUpscaleIds: dropPendingUpscaleId(s.pendingUpscaleIds, id),
        }))
      }
    } catch (e) {
      set((s) => ({
        pendingUpscaleIds: dropPendingUpscaleId(s.pendingUpscaleIds, id),
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
      await startCatalogInstall({ kind: "promptTools", provider }, catalogHost)
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Prompt Tools install failed"
      )
    }
  },
})
