import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import { startCatalogInstall } from "@/lib/catalog-install"
import {
  ensureDownload,
  installComfyui,
  listDownloads,
  listSettings,
  runtimePinsStatus,
  startComfyui,
  stopComfyui,
  type GpuInfo,
  type RuntimeInstall,
} from "@/lib/host"
import {
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet, SETTING_GPU_VENDOR } from "./helpers"

async function comfyInstallVersion(
  runtimes: RuntimeInstall[]
): Promise<string> {
  const fromRow = runtimes.find((r) => r.engine === "comfyui")?.version?.trim()
  if (fromRow) return fromRow
  try {
    return (await runtimePinsStatus()).comfy.expected
  } catch {
    return ""
  }
}

/** Installed + idle — safe to warm on app launch (not mid-install / already up). */
export function canAutoStartComfy(
  runtimes: RuntimeInstall[],
  downloadSnapshot?: {
    active: { kind: string } | null
    queued: { kind: string }[]
  }
): boolean {
  const comfy = runtimes.find((r) => r.engine === "comfyui")
  if (!comfy?.installPath?.trim()) return false
  if (comfy.status !== "ready") return false
  if (downloadSnapshot?.active?.kind === "runtime") return false
  if (downloadSnapshot?.queued.some((j) => j.kind === "runtime")) return false
  return true
}

export type RuntimeSlice = {
  runtimes: RuntimeInstall[]
  gpu: GpuInfo | null
  runtimeBusy: boolean
  runtimeMessage: string | null
  comfyHealthy: boolean
  setRuntimes: Dispatch<SetStateAction<RuntimeInstall[]>>
  setGpu: Dispatch<SetStateAction<GpuInfo | null>>
  setRuntimeBusy: Dispatch<SetStateAction<boolean>>
  setRuntimeMessage: Dispatch<SetStateAction<string | null>>
  setComfyHealthy: Dispatch<SetStateAction<boolean>>
  handleInstallComfy: () => Promise<void>
  handleStartComfy: (opts?: { quiet?: boolean }) => Promise<void>
  handleStopComfy: () => Promise<void>
  /** Warm ComfyUI when installed and idle (app start / post-install). */
  maybeAutoStartComfy: () => void
}

export const createRuntimeSlice: StateCreator<
  StudioStore,
  [],
  [],
  RuntimeSlice
> = (set, get) => ({
  runtimes: [],
  gpu: null,
  runtimeBusy: false,
  runtimeMessage: null,
  comfyHealthy: false,

  setRuntimes: (next) => set((s) => ({ runtimes: applySet(s.runtimes, next) })),
  setGpu: (next) => set((s) => ({ gpu: applySet(s.gpu, next) })),
  setRuntimeBusy: (next) =>
    set((s) => ({ runtimeBusy: applySet(s.runtimeBusy, next) })),
  setRuntimeMessage: (next) =>
    set((s) => ({ runtimeMessage: applySet(s.runtimeMessage, next) })),
  setComfyHealthy: (next) =>
    set((s) => ({ comfyHealthy: applySet(s.comfyHealthy, next) })),

  handleInstallComfy: async () => {
    const s = get()
    const gpu = s.gpu
    if (gpu?.needsVendorChoice) {
      const settings = await listSettings().catch(
        () => ({}) as Record<string, string>
      )
      if (!settings[SETTING_GPU_VENDOR]?.trim()) {
        s.setGpuVendorDialogOpen(true)
        const err = new Error(
          "Choose which GPU to use before installing the runtime"
        )
        notifyError(err.message, "GPU required")
        throw err
      }
    }
    s.setRuntimeBusy(true)
    s.setRuntimeMessage("Queued ComfyUI install…")
    const ver = await comfyInstallVersion(s.runtimes)
    notifyInfo(
      "Installing Runtime",
      ver ? `Installing ComfyUI ${ver}` : "Installing ComfyUI…",
      "runtime-install"
    )
    try {
      // Force reinstall so GPU vendor / portable pin changes replace the old build.
      await startCatalogInstall(
        { kind: "runtime", engine: "comfyui" },
        { ensureDownload, installRuntime: installComfyui }
      )
      // Don't rely only on the event race — pull the snapshot so First-run
      // sees the queued runtime job immediately.
      const snap = await listDownloads().catch(() => null)
      if (snap) s.setDownloadSnapshot(snap)
    } catch (e) {
      s.setRuntimeBusy(false)
      s.setRuntimeMessage(null)
      const message = e instanceof Error ? e.message : String(e)
      notifyError(message, "ComfyUI install failed")
      throw e instanceof Error ? e : new Error(message)
    }
  },

  handleStartComfy: async (opts) => {
    const s = get()
    s.setRuntimeBusy(true)
    s.setRuntimeMessage("Starting runtime…")
    if (!opts?.quiet) {
      notifyProgress("runtime", "Starting runtime")
    }
    try {
      await startComfyui()
    } catch (e) {
      s.setRuntimeBusy(false)
      s.setComfyHealthy(false)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Failed to start runtime"
      )
    }
  },

  handleStopComfy: async () => {
    const s = get()
    s.setRuntimeBusy(true)
    try {
      await stopComfyui()
      s.setComfyHealthy(false)
      s.setRuntimeMessage("ComfyUI stopped")
      notifySuccess("ComfyUI stopped")
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Failed to stop ComfyUI"
      )
    } finally {
      s.setRuntimeBusy(false)
    }
  },

  maybeAutoStartComfy: () => {
    const s = get()
    if (!canAutoStartComfy(s.runtimes, s.downloadSnapshot)) return
    void s.handleStartComfy({ quiet: true })
  },
})
