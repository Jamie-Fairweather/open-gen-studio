"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  comfyuiStatus,
  detectGpu,
  galleryItemCategory,
  getOfficialBlueprint,
  isTauri,
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
  type UpscaleModelInfo,
} from "@/lib/host"
import {
  applyReuseAllSettings,
  lorasFromRecipe,
  pickDefaultBlueprintId,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import { formatBytes, formatDuration } from "@/lib/format"
import {
  SIDE_LENGTH_DEFAULT,
  sizeFromAspectAndSide,
  syncSizeControls,
} from "@/lib/image-size"
import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"
import { EMPTY_DOWNLOAD_SNAPSHOT } from "@/components/studio/slices/downloads"
import { SETTING_SELECTED_BLUEPRINT } from "@/components/studio/slices/helpers"
import {
  selectActiveSelectedId,
  selectTabGallery,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { tabFromPath } from "@/components/studio/studio-tabs"

const subscribeNoop = () => () => {}

/**
 * Mounts once under the studio layout: wires Next router into studioRefs,
 * hydrates host data, and keeps store in sync with Tauri events.
 */
export function StudioBootstrap({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribeNoop, isTauri, () => true)
  const pathname = usePathname()
  const router = useRouter()
  const studioTab = tabFromPath(pathname)

  useEffect(() => {
    useStudioStore.getState().setDesktop(desktop)
  }, [desktop])

  useEffect(() => {
    useStudioStore.getState().setStudioTab(studioTab)
  }, [studioTab])

  useEffect(() => {
    studioRefs.navigateTab = (tab) => {
      router.push(`/${tab}`)
    }
    studioRefs.pushPath = (path) => {
      router.push(path)
    }
  }, [router])

  // Drop gallery selection that is not on the current tab.
  const selectedGalleryId = useStudioStore((s) => s.selectedGalleryId)
  const gallery = useStudioStore((s) => s.gallery)
  useEffect(() => {
    const tabGallery = selectTabGallery(useStudioStore.getState())
    if (
      selectedGalleryId != null &&
      !tabGallery.some((item) => item.id === selectedGalleryId)
    ) {
      useStudioStore.getState().setSelectedGalleryId(null)
    }
  }, [selectedGalleryId, gallery, studioTab])

  // Load blueprint detail when selection changes.
  const activeSelectedId = useStudioSelector(selectActiveSelectedId)

  useEffect(() => {
    if (!activeSelectedId || !desktop) return
    let cancelled = false
    void getOfficialBlueprint(activeSelectedId)
      .then((d) => {
        if (cancelled) return
        const store = useStudioStore.getState()
        store.setDetail(d)
        const recipe = studioRefs.pendingRecipe
        studioRefs.pendingRecipe = null
        const next: Record<string, unknown> = {}
        for (const c of d.controls) {
          if (c.default !== undefined) {
            next[c.id] = c.default
          }
        }
        let values = recipe ? applyReuseAllSettings(next, recipe) : next
        if (recipe) {
          store.setLoraStack(lorasFromRecipe(recipe, studioRefs.loraPacks))
          const up = upscaleFromRecipe(recipe, d.arch)
          store.setUpscaleEnabled(up.enabled)
          store.setUpscaleModelId(up.modelId)
          store.setUsduEnabled(up.usduEnabled)
          store.setUsduScale(up.usduScale)
          store.setUsduSteps(up.usduSteps)
          store.setUsduDenoise(up.usduDenoise)
        }
        const hasW = d.controls.some((c) => c.id === "width")
        const hasH = d.controls.some((c) => c.id === "height")
        if (hasW && hasH) {
          if (recipe) {
            const width = Number(values.width)
            const height = Number(values.height)
            if (Number.isFinite(width) && Number.isFinite(height)) {
              const synced = syncSizeControls(width, height)
              store.setAspectId(synced.aspectId)
              store.setSideLength(synced.sideLength)
            }
          } else {
            const { width, height } = sizeFromAspectAndSide(
              studioRefs.aspectId,
              studioRefs.sideLength || SIDE_LENGTH_DEFAULT
            )
            values = { ...values, width, height }
          }
        }
        store.setControlValues(values)
        if (recipe?.prompt) {
          store.setPrompt(recipe.prompt)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          notifyError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeSelectedId, desktop])

  // Settings dialog: load tokens when opened.
  const settingsOpen = useStudioStore((s) => s.settingsOpen)
  useEffect(() => {
    if (!settingsOpen || !isTauri()) return
    let cancelled = false
    void listSettings()
      .then((settings) => {
        if (cancelled) return
        const store = useStudioStore.getState()
        store.setHfToken(settings.huggingface_token ?? "")
        store.setHfTokenDirty(false)
        store.setCivitaiToken(settings.civitai_api_key ?? "")
        store.setCivitaiTokenDirty(false)
      })
      .catch((e) =>
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      )
    return () => {
      cancelled = true
    }
  }, [settingsOpen])

  // Tauri event listeners + initial load.
  useEffect(() => {
    if (!desktop) return

    const store = () => useStudioStore.getState()

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

    const SPEED_WINDOW_MS = 10_000
    const SPEED_MIN_MS = 3_000
    let speedSamples: { t: number; bytes: number; url: string }[] = []
    let emaSpeed = 0

    async function load() {
      try {
        unlistenBlueprintProbe = await onBlueprintProbe((p) => {
          store().setSizesProbing(p.stage === "start")
        })
        unlistenBlueprintSizes = await onBlueprintSizes((bps) => {
          store().setBlueprints(bps)
          store().setSizesProbing(false)
          store().setSelectedId((prev) =>
            pickDefaultBlueprintId(bps, prev ?? studioRefs.preferredBlueprintId)
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
        studioRefs.preferredBlueprintId =
          settings[SETTING_SELECTED_BLUEPRINT]?.trim() || null
        const s = store()
        s.setGpu(gpuInfo)
        s.setRuntimes(rts)
        s.setBlueprints(bps)
        s.setBlueprintsLoaded(true)
        s.setLoraPacks(loras)
        s.setUpscaleModels(upscalers)
        s.setUsduReady(usdu)
        s.setGallery(items)
        s.setComfyHealthy(status.healthy)
        s.setSelectedId((prev) =>
          pickDefaultBlueprintId(bps, prev ?? studioRefs.preferredBlueprintId)
        )
        const installing = rts.some(
          (r) => r.engine === "comfyui" && r.status === "installing"
        )
        s.setRuntimeBusy(installing)
        if (installing) {
          s.setRuntimeMessage("Installing ComfyUI in the background…")
          notifyProgress(
            "runtime",
            "Installing ComfyUI",
            "Installing in the background…"
          )
        }
        const snap = await listDownloads().catch(() => EMPTY_DOWNLOAD_SNAPSHOT)
        s.setDownloadSnapshot(snap)
      } catch (e) {
        store().setSizesProbing(false)
        store().setBlueprintsLoaded(true)
        notifyError(e instanceof Error ? e.message : String(e))
      }
    }

    void load()

    void onDownloadManager((snap) => {
      store().setDownloadSnapshot(snap)
    }).then((u) => {
      unlistenDownloadManager = u
    })

    void onRuntimesUpdated((runtime) => {
      store().setRuntimes((prev) => {
        const i = prev.findIndex((x) => x.id === runtime.id)
        if (i === -1) return [runtime, ...prev]
        const next = [...prev]
        next[i] = runtime
        return next
      })
      store().setRuntimeBusy(
        runtime.status === "installing" || runtime.status === "starting"
      )
      if (runtime.status === "ready") {
        store().setComfyHealthy(false)
        store().setRuntimeMessage("Runtime ready")
        store().setRuntimeBusy(false)
      } else if (runtime.status === "running") {
        store().setComfyHealthy(true)
        store().setRuntimeMessage("Runtime is running")
        store().setRuntimeBusy(false)
        notifyProgress("runtime", "Runtime ready", "Running", true)
      } else if (runtime.status === "error" && runtime.error) {
        notifyError(runtime.error, "Runtime error")
        store().setComfyHealthy(false)
        store().setRuntimeBusy(false)
      }
    }).then((u) => {
      unlistenRuntimes = u
    })

    void onRuntimeProgress((p) => {
      store().setRuntimeMessage(`${p.stage}: ${p.message}`)
      if (p.stage === "done" || p.stage === "ready") {
        store().setRuntimeBusy(false)
        if (p.stage === "ready") store().setComfyHealthy(true)
        notifyProgress("runtime", "Runtime ready", p.message, true)
      } else if (p.stage === "error") {
        store().setRuntimeBusy(false)
        store().setComfyHealthy(false)
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
      store().setRuntimeMessage(p.done ? msg : `Downloading… ${msg}`)
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
        .then((bps) => store().setBlueprints(bps))
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
        store().setGenerating(false)
        store().setActiveJobId((id) => (id === job.id ? null : id))
        store().clearLivePreview()
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
          store().setGenStep({ step: p.step, max: p.max })
        }
        return
      }
      if (p.stage === "preview") {
        if (p.previewPath) store().queueLivePreview(p.previewPath)
        return
      }
      if (p.stage === "done") {
        store().setGenerating(false)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        store().clearLivePreview()
        notifySuccess("Generation complete", p.message)
      } else if (p.stage === "cancelled") {
        store().setGenerating(false)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        store().clearLivePreview()
        notifyInfo("Cancelled", p.message, "job")
      } else if (p.stage === "error") {
        store().setGenerating(false)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        store().clearLivePreview()
        notifyError(p.message, "Generation failed")
      } else if (p.stage === "start") {
        notifyProgress("runtime", "Starting runtime", p.message)
      }
    }).then((u) => {
      unlistenJobProgress = u
    })

    void onGalleryUpdated((item) => {
      const category = galleryItemCategory(item)
      store().setGallery((prev) => {
        if (prev.some((x) => x.id === item.id)) return prev
        return [item, ...prev]
      })
      studioRefs.navigateTab(category)
      store().setSelectedGalleryId(item.id)
    }).then((u) => {
      unlistenGallery = u
    })

    void onGalleryDeleted((id) => {
      store().setGallery((prev) => prev.filter((item) => item.id !== id))
      store().setSelectedGalleryId((current) =>
        current === id ? null : current
      )
    }).then((u) => {
      unlistenGalleryDeleted = u
    })

    void onLorasUpdated(() => {
      void listLoras()
        .then((packs) => store().setLoraPacks(packs))
        .catch((e) =>
          notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
        )
    }).then((u) => {
      unlistenLorasUpdated = u
    })

    void onUpscalersUpdated(() => {
      void listUpscalers()
        .then((models) => store().setUpscaleModels(models))
        .catch(() => {})
      void usduNodeReady()
        .then((ready) => store().setUsduReady(ready))
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
              ? "SUPIR node ready - restart Comfy if it was running"
              : p.modelId.startsWith("supir-")
                ? "SUPIR weights ready"
                : "Upscale model ready"
        )
        void listUpscalers()
          .then((models) => store().setUpscaleModels(models))
          .catch(() => {})
        void usduNodeReady()
          .then((ready) => store().setUsduReady(ready))
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
          .then((packs) => store().setLoraPacks(packs))
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
  }, [desktop])

  return children
}
