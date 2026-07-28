import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  ensureDownload,
  startComfyui,
  stopComfyui,
  type GpuInfo,
  type RuntimeInstall,
} from "@/lib/host"
import { notifyError, notifyProgress, notifySuccess } from "@/lib/notify"
import type { StudioStore } from "../studio-store-types"
import { applySet } from "./helpers"

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
  handleStartComfy: () => Promise<void>
  handleStopComfy: () => Promise<void>
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
    s.setRuntimeBusy(true)
    s.setRuntimeMessage("Queued ComfyUI install…")
    notifyProgress("runtime", "Installing ComfyUI", "Queued install…")
    try {
      await ensureDownload(
        { kind: "runtime", engine: "comfyui" },
        { wait: false }
      )
    } catch (e) {
      s.setRuntimeBusy(false)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "ComfyUI install failed"
      )
    }
  },

  handleStartComfy: async () => {
    const s = get()
    s.setRuntimeBusy(true)
    s.setRuntimeMessage("Starting runtime…")
    notifyProgress("runtime", "Starting runtime")
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
})
