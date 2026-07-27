"use client"

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react"
import {
  comfyuiStatus,
  detectGpu,
  galleryItemCategory,
  listBlueprints,
  listDownloads,
  listGallery,
  listLoras,
  listRuntimes,
  listSettings,
  listUpscalers,
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
  onDownloadManager,
  onDownloadProgress,
  onGalleryDeleted,
  onGalleryUpdated,
  onJobProgress,
  onJobsUpdated,
  onLoraProgress,
  onLorasUpdated,
  onPromptToolsProgress,
  onRuntimeProgress,
  onRuntimesUpdated,
  onUpscaleProgress,
  onUpscalersUpdated,
  usduNodeReady,
  type Blueprint,
  type DownloadSnapshot,
  type GalleryItem,
  type GpuInfo,
  type LoraPack,
  type RuntimeInstall,
  type StudioTab,
  type UpscaleModelInfo,
} from "@/lib/host"
import { pickDefaultBlueprintId } from "@/lib/blueprint-helpers"
import { formatBytes, formatDuration } from "@/lib/format"
import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"

const SETTING_SELECTED_BLUEPRINT = "selected_blueprint_id"

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadSnapshot = {
  active: null,
  queued: [],
  history: [],
}

export type StudioBootstrapDeps = {
  desktop: boolean
  preferredBlueprintIdRef: MutableRefObject<string | null>
  navigateTabRef: MutableRefObject<(tab: StudioTab) => void>
  clearLivePreview: () => void
  queueLivePreview: (path: string) => void
  setSizesProbing: Dispatch<SetStateAction<boolean>>
  setBlueprints: Dispatch<SetStateAction<Blueprint[]>>
  setSelectedId: Dispatch<SetStateAction<string | null>>
  setGpu: Dispatch<SetStateAction<GpuInfo | null>>
  setRuntimes: Dispatch<SetStateAction<RuntimeInstall[]>>
  setBlueprintsLoaded: Dispatch<SetStateAction<boolean>>
  setLoraPacks: Dispatch<SetStateAction<LoraPack[]>>
  setUpscaleModels: Dispatch<SetStateAction<UpscaleModelInfo[]>>
  setUsduReady: Dispatch<SetStateAction<boolean>>
  setGallery: Dispatch<SetStateAction<GalleryItem[]>>
  setComfyHealthy: Dispatch<SetStateAction<boolean>>
  setRuntimeBusy: Dispatch<SetStateAction<boolean>>
  setRuntimeMessage: Dispatch<SetStateAction<string | null>>
  setDownloadSnapshot: Dispatch<SetStateAction<DownloadSnapshot>>
  setGenerating: Dispatch<SetStateAction<boolean>>
  setActiveJobId: Dispatch<SetStateAction<string | null>>
  setGenStep: Dispatch<SetStateAction<{ step: number; max: number } | null>>
  setSelectedGalleryId: Dispatch<SetStateAction<string | null>>
}

/** Wire Tauri event listeners + initial desktop loads. Re-runs only when `desktop` flips. */
export function useStudioBootstrap(deps: StudioBootstrapDeps) {
  const {
    desktop,
    preferredBlueprintIdRef,
    navigateTabRef,
    clearLivePreview,
    queueLivePreview,
    setSizesProbing,
    setBlueprints,
    setSelectedId,
    setGpu,
    setRuntimes,
    setBlueprintsLoaded,
    setLoraPacks,
    setUpscaleModels,
    setUsduReady,
    setGallery,
    setComfyHealthy,
    setRuntimeBusy,
    setRuntimeMessage,
    setDownloadSnapshot,
    setGenerating,
    setActiveJobId,
    setGenStep,
    setSelectedGalleryId,
  } = deps

  useEffect(() => {
    if (!desktop) return

    let unlistenRuntimes: (() => void) | undefined
    let unlistenProgress: (() => void) | undefined
    let unlistenDownload: (() => void) | undefined
    let unlistenDownloadManager: (() => void) | undefined
    let unlistenBlueprintProgress: (() => void) | undefined
    let unlistenBlueprintsUpdated: (() => void) | undefined
    let unlistenBlueprintSizes: (() => void) | undefined
    let unlistenBlueprintProbe: (() => void) | undefined
    let unlistenJobs: (() => void) | undefined
    let unlistenJobProgress: (() => void) | undefined
    let unlistenGallery: (() => void) | undefined
    let unlistenGalleryDeleted: (() => void) | undefined
    let unlistenLorasUpdated: (() => void) | undefined
    let unlistenLoraProgress: (() => void) | undefined
    let unlistenUpscalersUpdated: (() => void) | undefined
    let unlistenUpscaleProgress: (() => void) | undefined
    let unlistenPromptToolsProgress: (() => void) | undefined

    /** Rolling window for runtime download speed (Comfy portable, etc.). */
    const SPEED_WINDOW_MS = 10_000
    const SPEED_MIN_MS = 3_000
    let speedSamples: { t: number; bytes: number; url: string }[] = []
    let emaSpeed = 0

    async function load() {
      try {
        unlistenBlueprintProbe = await onBlueprintProbe((p) => {
          if (p.stage === "start") setSizesProbing(true)
          else setSizesProbing(false)
        })
        unlistenBlueprintSizes = await onBlueprintSizes((bps) => {
          setBlueprints(bps)
          setSizesProbing(false)
          setSelectedId((prev) =>
            pickDefaultBlueprintId(bps, prev ?? preferredBlueprintIdRef.current)
          )
        })

        const [
          gpuInfo,
          rts,
          status,
          bps,
          items,
          settings,
          loras,
          upscalers,
          usdu,
        ] = await Promise.all([
          detectGpu(),
          listRuntimes(),
          comfyuiStatus(),
          listBlueprints(),
          listGallery(),
          listSettings(),
          listLoras(),
          listUpscalers().catch(() => [] as UpscaleModelInfo[]),
          usduNodeReady().catch(() => false),
        ])
        preferredBlueprintIdRef.current =
          settings[SETTING_SELECTED_BLUEPRINT]?.trim() || null
        setGpu(gpuInfo)
        setRuntimes(rts)
        setBlueprints(bps)
        setBlueprintsLoaded(true)
        setLoraPacks(loras)
        setUpscaleModels(upscalers)
        setUsduReady(usdu)
        setGallery(items)
        setComfyHealthy(status.healthy)
        setSelectedId((prev) =>
          pickDefaultBlueprintId(bps, prev ?? preferredBlueprintIdRef.current)
        )
        const installing = rts.some(
          (r) => r.engine === "comfyui" && r.status === "installing"
        )
        setRuntimeBusy(installing)
        if (installing) {
          setRuntimeMessage("Installing ComfyUI in the background…")
          notifyProgress(
            "runtime",
            "Installing ComfyUI",
            "Installing in the background…"
          )
        }
        const snap = await listDownloads().catch(() => EMPTY_DOWNLOAD_SNAPSHOT)
        setDownloadSnapshot(snap)
      } catch (e) {
        setSizesProbing(false)
        setBlueprintsLoaded(true)
        notifyError(e instanceof Error ? e.message : String(e))
      }
    }

    void load()

    void onDownloadManager((snap) => {
      setDownloadSnapshot(snap)
    }).then((u) => {
      unlistenDownloadManager = u
    })

    void onRuntimesUpdated((runtime) => {
      setRuntimes((prev) => {
        const i = prev.findIndex((x) => x.id === runtime.id)
        if (i === -1) return [runtime, ...prev]
        const next = [...prev]
        next[i] = runtime
        return next
      })
      setRuntimeBusy(
        runtime.status === "installing" || runtime.status === "starting"
      )
      if (runtime.status === "ready") {
        setComfyHealthy(false)
        setRuntimeMessage("Runtime ready")
        setRuntimeBusy(false)
      } else if (runtime.status === "running") {
        setComfyHealthy(true)
        setRuntimeMessage("Runtime is running")
        setRuntimeBusy(false)
        notifyProgress("runtime", "Runtime ready", "Running", true)
      } else if (runtime.status === "error" && runtime.error) {
        notifyError(runtime.error, "Runtime error")
        setComfyHealthy(false)
        setRuntimeBusy(false)
      }
    }).then((u) => {
      unlistenRuntimes = u
    })

    void onRuntimeProgress((p) => {
      setRuntimeMessage(`${p.stage}: ${p.message}`)
      if (p.stage === "done" || p.stage === "ready") {
        setRuntimeBusy(false)
        if (p.stage === "ready") setComfyHealthy(true)
        notifyProgress("runtime", "Runtime ready", p.message, true)
      } else if (p.stage === "error") {
        setRuntimeBusy(false)
        setComfyHealthy(false)
        notifyError(p.message, "Runtime error")
      } else if (p.stage === "start") {
        notifyProgress("runtime", "Starting runtime", p.message)
      } else {
        notifyProgress("runtime", "Runtime", p.message)
      }
    }).then((u) => {
      unlistenProgress = u
    })

    void onDownloadProgress((p) => {
      // Runtime / other non-manager status line only (manager owns install progress).
      const now = performance.now()
      const trackedBytes = p.downloaded
      if (p.done) {
        speedSamples = []
        emaSpeed = 0
      } else if (p.total != null && p.total > trackedBytes) {
        if (speedSamples.length > 0 && speedSamples[0]!.url !== p.url) {
          speedSamples = []
          emaSpeed = 0
        }
        speedSamples.push({ t: now, bytes: trackedBytes, url: p.url })
        const cutoff = now - SPEED_WINDOW_MS
        while (speedSamples.length > 1 && speedSamples[0]!.t < cutoff) {
          speedSamples.shift()
        }
        while (
          speedSamples.length > 1 &&
          speedSamples[speedSamples.length - 1]!.bytes < speedSamples[0]!.bytes
        ) {
          speedSamples.shift()
        }
        if (speedSamples.length >= 2) {
          const oldest = speedSamples[0]!
          const newest = speedSamples[speedSamples.length - 1]!
          const dtMs = newest.t - oldest.t
          if (dtMs >= SPEED_MIN_MS) {
            const windowSpeed = ((newest.bytes - oldest.bytes) / dtMs) * 1000
            emaSpeed =
              emaSpeed > 0 ? emaSpeed * 0.88 + windowSpeed * 0.12 : windowSpeed
          }
        }
      }

      const total = p.total ? ` / ${formatBytes(p.total)}` : ""
      const pct =
        p.total && p.total > 0
          ? ` (${Math.min(100, Math.round((p.downloaded / p.total) * 100))}%)`
          : ""
      let etaSuffix = ""
      if (
        !p.done &&
        p.total != null &&
        p.total > p.downloaded &&
        emaSpeed > 8 * 1024
      ) {
        const remain = p.total - p.downloaded
        etaSuffix = ` · ${formatBytes(emaSpeed)}/s · ETA ${formatDuration(remain / emaSpeed)}`
      }
      const msg = p.done
        ? "Download complete"
        : `${formatBytes(p.downloaded)}${total}${pct}${etaSuffix}`
      setRuntimeMessage(p.done ? msg : `Downloading… ${msg}`)
    }).then((u) => {
      unlistenDownload = u
    })

    void onBlueprintProgress((p) => {
      if (p.stage === "done") {
        notifySuccess("Blueprint ready", p.message)
        return
      }
      if (p.stage === "error") {
        notifyError(p.message, "Blueprint install failed")
        return
      }
      if (p.stage === "cancelled") {
        notifyDismiss("blueprint")
      }
    }).then((u) => {
      unlistenBlueprintProgress = u
    })

    void onBlueprintsUpdated(() => {
      void listBlueprints()
        .then(setBlueprints)
        .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
    }).then((u) => {
      unlistenBlueprintsUpdated = u
    })

    void onJobsUpdated((job) => {
      if (
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      ) {
        setGenerating(false)
        setActiveJobId((id) => (id === job.id ? null : id))
        clearLivePreview()
      }
      if (job.status === "failed" && job.error) {
        notifyError(job.error, "Generation failed")
      }
      if (job.status === "cancelled") {
        notifyInfo("Cancelled", "Generation was cancelled", "job")
      }
    }).then((u) => {
      unlistenJobs = u
    })

    void onJobProgress((p) => {
      if (p.stage !== "start") {
        notifyDismiss("runtime")
      }
      if (p.stage === "step") {
        if (p.step != null && p.max != null && p.max > 0) {
          setGenStep({ step: p.step, max: p.max })
        }
        return
      }
      if (p.stage === "preview") {
        if (p.previewPath) queueLivePreview(p.previewPath)
        return
      }
      if (p.stage === "done") {
        setGenerating(false)
        setActiveJobId((id) => (id === p.jobId ? null : id))
        clearLivePreview()
        notifySuccess("Generation complete", p.message)
      } else if (p.stage === "cancelled") {
        setGenerating(false)
        setActiveJobId((id) => (id === p.jobId ? null : id))
        clearLivePreview()
        notifyInfo("Cancelled", p.message, "job")
      } else if (p.stage === "error") {
        setGenerating(false)
        setActiveJobId((id) => (id === p.jobId ? null : id))
        clearLivePreview()
        notifyError(p.message, "Generation failed")
      } else if (p.stage === "start") {
        notifyProgress("runtime", "Starting runtime", p.message)
      }
    }).then((u) => {
      unlistenJobProgress = u
    })

    void onGalleryUpdated((item) => {
      const category = galleryItemCategory(item)
      setGallery((prev) => {
        if (prev.some((x) => x.id === item.id)) return prev
        return [item, ...prev]
      })
      navigateTabRef.current(category)
      setSelectedGalleryId(item.id)
    }).then((u) => {
      unlistenGallery = u
    })

    void onGalleryDeleted((id) => {
      setGallery((prev) => prev.filter((item) => item.id !== id))
      setSelectedGalleryId((current) => (current === id ? null : current))
    }).then((u) => {
      unlistenGalleryDeleted = u
    })

    void onLorasUpdated(() => {
      void listLoras()
        .then(setLoraPacks)
        .catch((e) =>
          notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
        )
    }).then((u) => {
      unlistenLorasUpdated = u
    })

    void onUpscalersUpdated(() => {
      void listUpscalers()
        .then(setUpscaleModels)
        .catch(() => {})
      void usduNodeReady()
        .then(setUsduReady)
        .catch(() => {})
    }).then((u) => {
      unlistenUpscalersUpdated = u
    })

    void onUpscaleProgress((p) => {
      if (p.stage === "error") {
        notifyError(p.message, "Upscale install failed")
      } else if (p.stage === "done") {
        notifySuccess(
          p.modelId === "usdu"
            ? "Ultimate SD Upscale ready"
            : p.modelId === "supir"
              ? "SUPIR node ready — restart Comfy if it was running"
              : p.modelId.startsWith("supir-")
                ? "SUPIR weights ready"
                : "Upscale model ready"
        )
        void listUpscalers()
          .then(setUpscaleModels)
          .catch(() => {})
        void usduNodeReady()
          .then(setUsduReady)
          .catch(() => {})
      }
    }).then((u) => {
      unlistenUpscaleProgress = u
    })

    void onPromptToolsProgress((p) => {
      if (p.stage === "error") {
        notifyError(p.message, "Prompt Tools install failed")
      }
    }).then((u) => {
      unlistenPromptToolsProgress = u
    })

    void onLoraProgress((p) => {
      if (p.stage === "error") {
        notifyError(p.message, "LoRA install failed")
      } else if (p.stage === "done") {
        notifySuccess("LoRA ready", `${p.loraId} · ${p.arch}`)
        void listLoras()
          .then(setLoraPacks)
          .catch(() => {})
      }
    }).then((u) => {
      unlistenLoraProgress = u
    })

    return () => {
      unlistenRuntimes?.()
      unlistenProgress?.()
      unlistenDownload?.()
      unlistenDownloadManager?.()
      unlistenBlueprintProgress?.()
      unlistenBlueprintsUpdated?.()
      unlistenBlueprintSizes?.()
      unlistenBlueprintProbe?.()
      unlistenJobs?.()
      unlistenJobProgress?.()
      unlistenGallery?.()
      unlistenGalleryDeleted?.()
      unlistenLorasUpdated?.()
      unlistenLoraProgress?.()
      unlistenUpscalersUpdated?.()
      unlistenUpscaleProgress?.()
      unlistenPromptToolsProgress?.()
    }
    // Same as pre-peel: setters/refs/preview helpers are stable enough; only rebind on desktop.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional desktop-only
  }, [desktop])
}
