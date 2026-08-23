import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  catalogGatePatch,
  collectGatedRepos,
  planCatalogInstall,
  startCatalogInstall,
  uninstallToastDescription,
} from "@/lib/catalog-install"
import {
  clearProviderToken,
  ensureDownload,
  getBlueprint,
  installComfyui,
  providerTokenStatus,
  setProviderToken,
  uninstallBlueprint,
} from "@/lib/host"
import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import type { GatedModelRepo } from "@/lib/hf"
import { notifyError, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet } from "./helpers"

const catalogHost = {
  ensureDownload,
  installRuntime: installComfyui,
}

/** Provider tokens, gated-terms dialogs, and blueprint install/uninstall for the studio store. */
export type SettingsSlice = {
  /** True when a token is stored in the OS credential store. */
  hasHfToken: boolean
  /** Draft for settings input — never loaded from the backend. */
  hfToken: string
  hfTokenDirty: boolean
  hfTokenSaving: boolean
  hfTokenDialogOpen: boolean
  gatedModelDialogOpen: boolean
  gatedModelRepos: GatedModelRepo[]
  /** True after the user confirms the gated-terms dialog for this install. */
  gatedTermsAcked: boolean
  hasCivitaiToken: boolean
  civitaiToken: string
  civitaiTokenDirty: boolean
  civitaiTokenSaving: boolean
  civitaiTokenDialogOpen: boolean
  pendingInstallId: string | null
  pendingLoraInstall: { id: string; arch: RecipeArch } | null
  setHasHfToken: Dispatch<SetStateAction<boolean>>
  setHfToken: Dispatch<SetStateAction<string>>
  setHfTokenDirty: Dispatch<SetStateAction<boolean>>
  setHfTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  setGatedModelDialogOpen: Dispatch<SetStateAction<boolean>>
  setHasCivitaiToken: Dispatch<SetStateAction<boolean>>
  setCivitaiToken: Dispatch<SetStateAction<string>>
  setCivitaiTokenDirty: Dispatch<SetStateAction<boolean>>
  setCivitaiTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  setPendingInstallId: Dispatch<SetStateAction<string | null>>
  setPendingLoraInstall: Dispatch<
    SetStateAction<{ id: string; arch: RecipeArch } | null>
  >
  refreshProviderTokenStatus: () => Promise<void>
  handleSaveHfToken: () => Promise<void>
  handleClearHfToken: () => Promise<void>
  handleSaveCivitaiToken: () => Promise<void>
  handleClearCivitaiToken: () => Promise<void>
  handleGatedModelDialogConfirm: () => Promise<void>
  handleHfTokenDialogConfirm: (token: string) => Promise<void>
  handleCivitaiTokenDialogConfirm: (token: string) => Promise<void>
  requestBlueprintInstall: (id: string) => Promise<void>
  handleInstallBlueprint: (id: string) => Promise<void>
  handleUninstallBlueprint: (id: string) => Promise<void>
}

/** Zustand slice: provider tokens, gated-terms dialogs, and blueprint install/uninstall. */
export const createSettingsSlice: StateCreator<
  StudioStore,
  [],
  [],
  SettingsSlice
> = (set, get) => {
  async function refreshStatus() {
    const status = await providerTokenStatus()
    set({
      hasHfToken: status.huggingface,
      hasCivitaiToken: status.civitai,
    })
  }

  /** Blocks blueprint installs behind token / gated-terms dialogs when needed. */
  async function ensureInstallTokens(id: string): Promise<boolean> {
    try {
      await refreshStatus()
      const { hasHfToken, hasCivitaiToken, gatedTermsAcked, blueprints } = get()
      const plan = await planCatalogInstall({
        row: { kind: "blueprint", id },
        tokens: { huggingface: hasHfToken, civitai: hasCivitaiToken },
        gatedTermsAcked,
        blueprint: blueprints.find((b) => b.id === id),
        collectGatedRepos: (blueprintId) =>
          collectGatedRepos(blueprintId, getBlueprint),
      })
      if (plan.action === "gate") {
        set(catalogGatePatch(plan.need, { kind: "blueprint", id }))
        return false
      }
      return true
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Settings")
      return false
    }
  }

  return {
    hasHfToken: false,
    hfToken: "",
    hfTokenDirty: false,
    hfTokenSaving: false,
    hfTokenDialogOpen: false,
    gatedModelDialogOpen: false,
    gatedModelRepos: [],
    gatedTermsAcked: false,
    hasCivitaiToken: false,
    civitaiToken: "",
    civitaiTokenDirty: false,
    civitaiTokenSaving: false,
    civitaiTokenDialogOpen: false,
    pendingInstallId: null,
    pendingLoraInstall: null,

    setHasHfToken: (next) =>
      set((s) => ({ hasHfToken: applySet(s.hasHfToken, next) })),
    setHfToken: (next) => set((s) => ({ hfToken: applySet(s.hfToken, next) })),
    setHfTokenDirty: (next) =>
      set((s) => ({ hfTokenDirty: applySet(s.hfTokenDirty, next) })),
    setHfTokenDialogOpen: (next) =>
      set((s) => ({ hfTokenDialogOpen: applySet(s.hfTokenDialogOpen, next) })),
    setGatedModelDialogOpen: (next) =>
      set((s) => ({
        gatedModelDialogOpen: applySet(s.gatedModelDialogOpen, next),
      })),
    setHasCivitaiToken: (next) =>
      set((s) => ({ hasCivitaiToken: applySet(s.hasCivitaiToken, next) })),
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

    refreshProviderTokenStatus: async () => {
      try {
        await refreshStatus()
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      }
    },

    handleSaveHfToken: async () => {
      set({ hfTokenSaving: true })
      try {
        const token = get().hfToken.trim()
        if (!token) {
          notifyError("Enter a token to save, or use Clear.", "Settings")
          return
        }
        await setProviderToken("huggingFace", token)
        set({
          hfToken: "",
          hfTokenDirty: false,
          hasHfToken: true,
        })
        notifySuccess(
          "Hugging Face token saved",
          "Stored securely on this device. Gated model downloads will use it."
        )
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ hfTokenSaving: false })
      }
    },

    handleClearHfToken: async () => {
      set({ hfTokenSaving: true })
      try {
        await clearProviderToken("huggingFace")
        set({
          hfToken: "",
          hfTokenDirty: false,
          hasHfToken: false,
        })
        notifySuccess("Hugging Face token cleared", "Token removed.")
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ hfTokenSaving: false })
      }
    },

    handleSaveCivitaiToken: async () => {
      set({ civitaiTokenSaving: true })
      try {
        const token = get().civitaiToken.trim()
        if (!token) {
          notifyError("Enter an API key to save, or use Clear.", "Settings")
          return
        }
        await setProviderToken("civitAi", token)
        set({
          civitaiToken: "",
          civitaiTokenDirty: false,
          hasCivitaiToken: true,
        })
        notifySuccess(
          "CivitAI API key saved",
          "Stored securely on this device. CivitAI downloads will use it."
        )
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ civitaiTokenSaving: false })
      }
    },

    handleClearCivitaiToken: async () => {
      set({ civitaiTokenSaving: true })
      try {
        await clearProviderToken("civitAi")
        set({
          civitaiToken: "",
          civitaiTokenDirty: false,
          hasCivitaiToken: false,
        })
        notifySuccess("CivitAI API key cleared", "API key removed.")
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      } finally {
        set({ civitaiTokenSaving: false })
      }
    },

    requestBlueprintInstall: async (id) => {
      try {
        await startCatalogInstall({ kind: "blueprint", id }, catalogHost)
      } catch (e) {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Blueprint install failed"
        )
      }
    },

    handleInstallBlueprint: async (id) => {
      set({ gatedTermsAcked: false })
      if (!(await ensureInstallTokens(id))) return
      set({ gatedTermsAcked: false, pendingInstallId: null })
      await get().requestBlueprintInstall(id)
    },

    handleUninstallBlueprint: async (id) => {
      try {
        const summary = await uninstallBlueprint(id)
        const name = get().blueprints.find((b) => b.id === id)?.name ?? id
        notifySuccess(name, uninstallToastDescription(summary))
      } catch (e) {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Blueprint uninstall failed"
        )
      }
    },

    handleGatedModelDialogConfirm: async () => {
      const s = get()
      const id = s.pendingInstallId
      set({ gatedModelDialogOpen: false, gatedTermsAcked: true })
      if (!id) return
      if (!(await ensureInstallTokens(id))) return
      set({ gatedTermsAcked: false, pendingInstallId: null })
      await s.requestBlueprintInstall(id)
    },

    handleHfTokenDialogConfirm: async (token) => {
      const s = get()
      const id = s.pendingInstallId
      const lora = s.pendingLoraInstall
      await setProviderToken("huggingFace", token)
      set({
        hfToken: "",
        hfTokenDirty: false,
        hfTokenDialogOpen: false,
        hasHfToken: true,
      })
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
        set({ gatedTermsAcked: false, pendingInstallId: null })
        await s.requestBlueprintInstall(id)
      } else {
        set({ gatedTermsAcked: false, pendingInstallId: null })
      }
    },

    handleCivitaiTokenDialogConfirm: async (token) => {
      const s = get()
      const id = s.pendingInstallId
      const lora = s.pendingLoraInstall
      await setProviderToken("civitAi", token)
      set({
        civitaiToken: "",
        civitaiTokenDirty: false,
        civitaiTokenDialogOpen: false,
        hasCivitaiToken: true,
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
      set({ gatedTermsAcked: false, pendingInstallId: null })
      if (id) await s.requestBlueprintInstall(id)
    },
  }
}
