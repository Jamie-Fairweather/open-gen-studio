import {
  listBlueprints,
  listJobQueue,
  listLoras,
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
  onJobQueue,
  onJobsUpdated,
  onLoraProgress,
  onLorasUpdated,
  onPromptToolsProgress,
  onRuntimeProgress,
  onRuntimesUpdated,
  onUpscaleProgress,
  onUpscalersUpdated,
  usduNodeReady,
} from "@/lib/host"
import { formatBytes, formatEta } from "@/lib/format"
import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"
import { pickDefaultBlueprintId } from "@/lib/blueprint-helpers"
import { useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import {
  createDownloadSpeedTracker,
  type DownloadProgressPayload,
} from "@/components/studio/bootstrap/download-speed"

type Store = ReturnType<typeof useStudioStore.getState>

export type HostListenerHandles = {
  unlistenRuntimes?: () => void
  unlistenProgress?: () => void
  unlistenDownload?: () => void
  unlistenDownloadManager?: () => void
  unlistenBlueprintProgress?: () => void
  unlistenBlueprintsUpdated?: () => void
  unlistenBlueprintSizes?: () => void
  unlistenBlueprintProbe?: () => void
  unlistenJobs?: () => void
  unlistenJobProgress?: () => void
  unlistenJobQueue?: () => void
  unlistenGallery?: () => void
  unlistenGalleryDeleted?: () => void
  unlistenLorasUpdated?: () => void
  unlistenLoraProgress?: () => void
  unlistenUpscalersUpdated?: () => void
  unlistenUpscaleProgress?: () => void
  unlistenPromptToolsProgress?: () => void
}

/** Registers Tauri host event subscriptions; returns async cleanup for all listeners. */
export function registerHostListeners(
  getStore: () => Store = () => useStudioStore.getState()
): HostListenerHandles {
  const handles: HostListenerHandles = {}

  const speedTracker = createDownloadSpeedTracker((bps) => {
    getStore().setDownloadSpeedBps(bps)
  })

  void onBlueprintProbe((p) => {
    getStore().setSizesProbing(p.stage === "start")
  }).then((u) => {
    handles.unlistenBlueprintProbe = u
  })

  void onBlueprintSizes((bps) => {
    getStore().setBlueprints(bps)
    getStore().setSizesProbing(false)
    getStore().setSelectedId((prev) =>
      pickDefaultBlueprintId(bps, prev ?? studioRefs.preferredBlueprintId)
    )
  }).then((u) => {
    handles.unlistenBlueprintSizes = u
  })

  void onDownloadManager((snap) => {
    getStore().setDownloadSnapshot(snap)
  }).then((u) => {
    handles.unlistenDownloadManager = u
  })

  void onRuntimesUpdated((runtime) => {
    getStore().setRuntimes((prev) => {
      const i = prev.findIndex((x) => x.id === runtime.id)
      if (i === -1) return [runtime, ...prev]
      const next = [...prev]
      next[i] = runtime
      return next
    })
    const runtimeJobActive =
      getStore().downloadSnapshot.active?.kind === "runtime"
    getStore().setRuntimeBusy(
      runtime.status === "installing" ||
        runtime.status === "starting" ||
        runtimeJobActive
    )
    if (runtime.status === "ready") {
      getStore().setComfyHealthy(false)
      if (!runtimeJobActive) {
        getStore().setRuntimeMessage("Runtime ready")
        getStore().setRuntimeBusy(false)
      }
    } else if (runtime.status === "running") {
      getStore().setComfyHealthy(true)
      getStore().setRuntimeMessage("Runtime is running")
      getStore().setRuntimeBusy(false)
      notifyProgress("runtime", "Runtime ready", "Running", true)
    } else if (runtime.status === "error" && runtime.error) {
      notifyError(runtime.error, "Runtime error")
      getStore().setComfyHealthy(false)
      getStore().setRuntimeBusy(false)
    }
  }).then((u) => {
    handles.unlistenRuntimes = u
  })

  void onRuntimeProgress((p) => {
    getStore().setRuntimeMessage(p.message)
    if (p.stage === "done") {
      getStore().setRuntimeBusy(false)
      notifySuccess("Runtime Installed", p.message)
    } else if (p.stage === "ready") {
      getStore().setRuntimeBusy(false)
      getStore().setComfyHealthy(true)
      notifyProgress("runtime", "Runtime ready", p.message, true)
    } else if (p.stage === "error") {
      getStore().setRuntimeBusy(false)
      getStore().setComfyHealthy(false)
      notifyError(p.message, "Runtime error")
    } else if (p.stage === "start") {
      notifyProgress("runtime", "Starting runtime", p.message)
    }
    // extract / configure / download: message only — detail lives on Downloads
  }).then((u) => {
    handles.unlistenProgress = u
  })

  void onDownloadProgress((p: DownloadProgressPayload) => {
    speedTracker.update(p)

    const total = p.total ? ` / ${formatBytes(p.total)}` : ""
    const pct =
      p.total && p.total > 0
        ? ` (${Math.min(100, Math.round((p.downloaded / p.total) * 100))}%)`
        : ""
    const emaSpeed = speedTracker.getEmaSpeed()
    let etaSuffix = ""
    if (
      !p.done &&
      p.total != null &&
      p.total > p.downloaded &&
      emaSpeed > 8 * 1024
    ) {
      const remain = p.total - p.downloaded
      etaSuffix = ` · ${formatBytes(emaSpeed)}/s · ETA ${formatEta(remain / emaSpeed)}`
    }
    const msg = p.done
      ? "Download complete"
      : `${formatBytes(p.downloaded)}${total}${pct}${etaSuffix}`
    getStore().setRuntimeMessage(p.done ? msg : `Downloading… ${msg}`)
  }).then((u) => {
    handles.unlistenDownload = u
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
    handles.unlistenBlueprintProgress = u
  })

  void onBlueprintsUpdated(() => {
    void listBlueprints()
      .then((bps) => getStore().setBlueprints(bps))
      .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
  }).then((u) => {
    handles.unlistenBlueprintsUpdated = u
  })

  void onJobsUpdated((job) => {
    const terminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    if (terminal) {
      // Defensive: prune even if jobs://queue was missed (ghost "running" chips).
      getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== job.id))
    }
    if (job.kind !== "generate") return
    if (terminal) {
      const stillGenerating = getStore().jobQueue.some(
        (i) => i.kind === "generate" && i.jobId !== job.id
      )
      getStore().setGenerating(stillGenerating)
      getStore().setActiveJobId((id) => (id === job.id ? null : id))
      if (!stillGenerating) getStore().clearLivePreview()
    }
    if (job.status === "failed" && job.error) {
      notifyError(job.error, "Generation failed")
    }
    if (job.status === "cancelled") {
      notifyInfo("Cancelled", "Generation was cancelled", "job")
    }
  }).then((u) => {
    handles.unlistenJobs = u
  })

  void onJobProgress((p) => {
    if (getStore().handleToolJobProgress(p)) return

    if (p.stage !== "start") {
      notifyDismiss("runtime")
    }
    if (p.stage === "step") {
      if (p.step != null && p.max != null && p.max > 0) {
        getStore().setGenStep({
          jobId: p.jobId,
          step: p.step,
          max: p.max,
        })
      }
      return
    }
    if (p.stage === "preview") {
      if (p.previewPath) getStore().queueLivePreview(p.previewPath)
      return
    }
    if (p.stage === "done") {
      getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
      const stillGenerating = getStore().jobQueue.some(
        (i) => i.kind === "generate" && i.jobId !== p.jobId
      )
      getStore().setGenerating(stillGenerating)
      getStore().setActiveJobId((id) => (id === p.jobId ? null : id))
      if (!stillGenerating) getStore().clearLivePreview()
    } else if (p.stage === "cancelled") {
      getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
      const stillGenerating = getStore().jobQueue.some(
        (i) => i.kind === "generate" && i.jobId !== p.jobId
      )
      getStore().setGenerating(stillGenerating)
      getStore().setActiveJobId((id) => (id === p.jobId ? null : id))
      if (!stillGenerating) getStore().clearLivePreview()
      notifyInfo("Cancelled", p.message, "job")
    } else if (p.stage === "error") {
      getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
      const stillGenerating = getStore().jobQueue.some(
        (i) => i.kind === "generate" && i.jobId !== p.jobId
      )
      getStore().setGenerating(stillGenerating)
      getStore().setActiveJobId((id) => (id === p.jobId ? null : id))
      if (!stillGenerating) getStore().clearLivePreview()
      notifyError(p.message, "Generation failed")
    } else if (p.stage === "start") {
      notifyProgress("runtime", "Starting runtime", p.message)
    }
  }).then((u) => {
    handles.unlistenJobProgress = u
  })

  void listJobQueue()
    .then((snap) => getStore().setJobQueue(snap.items))
    .catch(() => {})
  void onJobQueue((snap) => {
    getStore().setJobQueue(snap.items)
    const runningGenerate = snap.items.find(
      (i) => i.kind === "generate" && i.status === "running"
    )
    const anyGenerate = snap.items.some((i) => i.kind === "generate")
    getStore().setGenerating(anyGenerate)
    if (runningGenerate) {
      getStore().setActiveJobId(runningGenerate.jobId)
    } else if (!anyGenerate) {
      getStore().setActiveJobId(null)
    }
  }).then((u) => {
    handles.unlistenJobQueue = u
  })

  void onGalleryUpdated((item) => {
    const s = getStore()
    if (s.gallery.some((x) => x.id === item.id)) {
      s.patchGalleryItem(item)
    } else {
      s.ingestGalleryItem(item)
    }
  }).then((u) => {
    handles.unlistenGallery = u
  })

  void onGalleryDeleted((id) => {
    getStore().setGallery((prev) => prev.filter((item) => item.id !== id))
    getStore().setSelectedGalleryId((current) =>
      current === id ? null : current
    )
  }).then((u) => {
    handles.unlistenGalleryDeleted = u
  })

  void onLorasUpdated(() => {
    void listLoras()
      .then((packs) => getStore().setLoraPacks(packs))
      .catch((e) =>
        notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
      )
  }).then((u) => {
    handles.unlistenLorasUpdated = u
  })

  void onUpscalersUpdated(() => {
    void listUpscalers()
      .then((models) => getStore().setUpscaleModels(models))
      .catch(() => {})
    void usduNodeReady()
      .then((ready) => getStore().setUsduReady(ready))
      .catch(() => {})
  }).then((u) => {
    handles.unlistenUpscalersUpdated = u
  })

  void onUpscaleProgress((p) => {
    const installingRuntime =
      getStore().downloadSnapshot.active?.kind === "runtime" ||
      getStore().runtimes.some(
        (r) => r.engine === "comfyui" && r.status === "installing"
      )
    if (installingRuntime && p.message) {
      getStore().setRuntimeMessage(p.message)
    }
    if (p.stage === "error") {
      notifyError(p.message, "Upscale install failed")
    } else if (p.stage === "done") {
      // Runtime install also pins managed nodes — skip per-node toasts there.
      if (!installingRuntime) {
        notifySuccess(
          p.modelId === "usdu"
            ? "Ultimate SD Upscale ready"
            : p.modelId === "supir"
              ? "SUPIR node ready - restart Comfy if it was running"
              : p.modelId.startsWith("supir-")
                ? "SUPIR weights ready"
                : "Upscale model ready"
        )
      }
      void listUpscalers()
        .then((models) => getStore().setUpscaleModels(models))
        .catch(() => {})
      void usduNodeReady()
        .then((ready) => getStore().setUsduReady(ready))
        .catch(() => {})
    }
  }).then((u) => {
    handles.unlistenUpscaleProgress = u
  })

  void onPromptToolsProgress((p) => {
    if (p.message) getStore().handlePromptToolsStatus(p.message)
    if (p.stage === "error") {
      notifyError(p.message, "Prompt Tools install failed")
    }
  }).then((u) => {
    handles.unlistenPromptToolsProgress = u
  })

  void onLoraProgress((p) => {
    if (p.stage === "error") {
      notifyError(p.message, "LoRA install failed")
    } else if (p.stage === "done") {
      notifySuccess("LoRA ready", `${p.loraId} · ${p.arch}`)
      void listLoras()
        .then((packs) => getStore().setLoraPacks(packs))
        .catch(() => {})
    }
  }).then((u) => {
    handles.unlistenLoraProgress = u
  })

  return handles
}

export function cleanupHostListeners(handles: HostListenerHandles) {
  handles.unlistenRuntimes?.()
  handles.unlistenProgress?.()
  handles.unlistenDownload?.()
  handles.unlistenDownloadManager?.()
  handles.unlistenBlueprintProgress?.()
  handles.unlistenBlueprintsUpdated?.()
  handles.unlistenBlueprintSizes?.()
  handles.unlistenBlueprintProbe?.()
  handles.unlistenJobs?.()
  handles.unlistenJobProgress?.()
  handles.unlistenJobQueue?.()
  handles.unlistenGallery?.()
  handles.unlistenGalleryDeleted?.()
  handles.unlistenLorasUpdated?.()
  handles.unlistenLoraProgress?.()
  handles.unlistenUpscalersUpdated?.()
  handles.unlistenUpscaleProgress?.()
  handles.unlistenPromptToolsProgress?.()
}
