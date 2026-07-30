import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import { ensureDownload, listSettings, setSetting } from "@/lib/host"
import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet } from "./helpers"

export type SettingsSlice = {
  hfToken: string
  hfTokenDirty: boolean
  hfTokenSaving: boolean
  hfTokenDialogOpen: boolean
  civitaiToken: string
  civitaiTokenDirty: boolean
  civitaiTokenSaving: boolean
  civitaiTokenDialogOpen: boolean
  pendingInstallId: string | null
  pendingLoraInstall: { id: string; arch: RecipeArch } | null
  setHfToken: Dispatch<SetStateAction<string>>
  setHfTokenDirty: Dispatch<SetStateAction<boolean>>
  setHfTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  setCivitaiToken: Dispatch<SetStateAction<string>>
  setCivitaiTokenDirty: Dispatch<SetStateAction<boolean>>
  setCivitaiTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  setPendingInstallId: Dispatch<SetStateAction<string | null>>
  setPendingLoraInstall: Dispatch<
    SetStateAction<{ id: string; arch: RecipeArch } | null>
  >
  handleSaveHfToken: () => Promise<void>
  handleSaveCivitaiToken: () => Promise<void>
  handleHfTokenDialogConfirm: (token: string) => Promise<void>
  handleCivitaiTokenDialogConfirm: (token: string) => Promise<void>
  requestBlueprintInstall: (id: string) => Promise<void>
  handleInstallBlueprint: (id: string) => Promise<void>
}

export const createSettingsSlice: StateCreator<
  StudioStore,
  [],
  [],
  SettingsSlice
> = (set, get) => {
  /** Blocks blueprint installs behind a token dialog when the source requires one. */
  async function ensureInstallTokens(id: string): Promise<boolean> {
    const s = get()
    const bp = s.blueprints.find((b) => b.id === id)
    try {
      const settings = await listSettings()
      if (bp?.requiresHfToken) {
        const token = (settings.huggingface_token ?? "").trim()
        if (!token) {
          s.setPendingInstallId(id)
          s.setHfTokenDialogOpen(true)
          return false
        }
      }
      if (bp?.requiresCivitaiToken) {
        const token = (settings.civitai_api_key ?? "").trim()
        if (!token) {
          s.setPendingInstallId(id)
          s.setCivitaiTokenDialogOpen(true)
          return false
        }
      }
      return true
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Settings")
      return false
    }
  }

  return {
    hfToken: "",
    hfTokenDirty: false,
    hfTokenSaving: false,
    hfTokenDialogOpen: false,
    civitaiToken: "",
    civitaiTokenDirty: false,
    civitaiTokenSaving: false,
    civitaiTokenDialogOpen: false,
    pendingInstallId: null,
    pendingLoraInstall: null,

    setHfToken: (next) => set((s) => ({ hfToken: applySet(s.hfToken, next) })),
    setHfTokenDirty: (next) =>
      set((s) => ({ hfTokenDirty: applySet(s.hfTokenDirty, next) })),
    setHfTokenDialogOpen: (next) =>
      set((s) => ({ hfTokenDialogOpen: applySet(s.hfTokenDialogOpen, next) })),
    setCivitaiToken: (next) =>
      set((s) => ({ civitaiToken: applySet(s.civitaiToken, next) })),
    setCivitaiTokenDirty: (next) =>
      set((s) => ({ civitaiTokenDirty: applySet(s.civitaiTokenDirty, next) })),
    setCivitaiTokenDialogOpen: (next) =>
      set((s) => ({
        civitaiTokenDialogOpen: applySet(s.civitaiTokenDialogOpen, next),
      })),
    setPendingInstallId: (next) =>
      set((s) => ({ pendingInstallId: applySet(s.pendingInstallId, next) })),
    setPendingLoraInstall: (next) =>
      set((s) => ({
        pendingLoraInstall: applySet(s.pendingLoraInstall, next),
      })),

    handleSaveHfToken: async () => {
      set({ hfTokenSaving: true })
      try {
        const token = get().hfToken
        await setSetting("huggingface_token", token.trim())
        set({ hfTokenDirty: false })
        notifySuccess(
          "Hugging Face token saved",
          token.trim()
            ? "Gated model downloads will use this token."
            : "Token cleared."
        )
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ hfTokenSaving: false })
      }
    },

    handleSaveCivitaiToken: async () => {
      set({ civitaiTokenSaving: true })
      try {
        const token = get().civitaiToken
        await setSetting("civitai_api_key", token.trim())
        set({ civitaiTokenDirty: false })
        notifySuccess(
          "CivitAI API key saved",
          token.trim()
            ? "CivitAI model downloads will use this key."
            : "API key cleared."
        )
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ civitaiTokenSaving: false })
      }
    },

    requestBlueprintInstall: async (id) => {
      try {
        await ensureDownload({ kind: "blueprint", id }, { wait: false })
      } catch (e) {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Blueprint install failed"
        )
      }
    },

    handleInstallBlueprint: async (id) => {
      if (!(await ensureInstallTokens(id))) return
      await get().requestBlueprintInstall(id)
    },

    handleHfTokenDialogConfirm: async (token) => {
      const s = get()
      const id = s.pendingInstallId
      const lora = s.pendingLoraInstall
      await setSetting("huggingface_token", token)
      set({ hfToken: token, hfTokenDirty: false, hfTokenDialogOpen: false })
      notifySuccess("Hugging Face token saved", "Continuing…")
      if (lora) {
        s.setPendingLoraInstall(null)
        if (!isRecipeArch(lora.arch)) {
          notifyError(`Unknown LoRA arch: ${lora.arch}`)
          return
        }
        await s.beginLoraInstall(lora.id, lora.arch)
        return
      }
      if (id) {
        if (!(await ensureInstallTokens(id))) return
        s.setPendingInstallId(null)
        await s.requestBlueprintInstall(id)
      } else {
        s.setPendingInstallId(null)
      }
    },

    handleCivitaiTokenDialogConfirm: async (token) => {
      const s = get()
      const id = s.pendingInstallId
      const lora = s.pendingLoraInstall
      await setSetting("civitai_api_key", token)
      set({
        civitaiToken: token,
        civitaiTokenDirty: false,
        civitaiTokenDialogOpen: false,
      })
      notifySuccess("CivitAI API key saved", "Continuing model download…")
      if (lora) {
        s.setPendingLoraInstall(null)
        if (!isRecipeArch(lora.arch)) {
          notifyError(`Unknown LoRA arch: ${lora.arch}`)
          return
        }
        await s.beginLoraInstall(lora.id, lora.arch)
        return
      }
      s.setPendingInstallId(null)
      if (id) await s.requestBlueprintInstall(id)
    },
  }
}
