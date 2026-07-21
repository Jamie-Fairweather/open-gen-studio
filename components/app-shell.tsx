"use client"

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagesIcon,
  LayersIcon,
  RatioIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  BlueprintPickerDialog,
  type BlueprintInstallProgress,
} from "@/components/blueprint-picker-dialog"
import { CreatorPanel } from "@/components/creator-panel"
import { GalleryPanel } from "@/components/gallery-panel"
import { HfTokenDialog } from "@/components/hf-token-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { Input } from "@/components/ui/input"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field"
import {
  cancelJob,
  comfyuiStatus,
  deleteGalleryItem,
  detectGpu,
  galleryItemCategory,
  gallerySrc,
  generateImage,
  getOfficialBlueprint,
  installComfyui,
  installOfficialBlueprint,
  isTauri,
  listGallery,
  listBlueprints,
  listRuntimes,
  listSettings,
  openExternalUrl,
  setSetting,
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
  onDownloadProgress,
  onGalleryDeleted,
  onGalleryUpdated,
  onJobProgress,
  onJobsUpdated,
  onRuntimeProgress,
  onRuntimesUpdated,
  parseGalleryRecipe,
  startComfyui,
  stopComfyui,
  type BlueprintDetail,
  type GalleryItem,
  type GalleryRecipe,
  type GpuInfo,
  type Blueprint,
  type RuntimeInstall,
  type StudioTab,
} from "@/lib/host"
import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"
import { cn } from "@/lib/utils"

const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "creator", label: "Creator" },
]

const ASPECT_PRESETS = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "4:3", label: "4:3", width: 1152, height: 864 },
  { id: "3:4", label: "3:4", width: 864, height: 1152 },
] as const

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "—"
  if (secs < 60) return `${Math.max(1, Math.ceil(secs))}s`
  const m = Math.floor(secs / 60)
  const s = Math.ceil(secs % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function isInstalled(bp: Blueprint): boolean {
  return bp.modelCount === 0 || bp.modelsReady >= bp.modelCount
}

/** Gallery reuse keeps prompts + size; advanced controls stay on blueprint defaults. */
function applyReuseSizeAndPrompts(
  base: Record<string, unknown>,
  recipe: GalleryRecipe
): Record<string, unknown> {
  const next = { ...base }
  if (recipe.values.width !== undefined) next.width = recipe.values.width
  if (recipe.values.height !== undefined) next.height = recipe.values.height
  if (recipe.values.negative !== undefined) {
    next.negative = recipe.values.negative
  }
  return next
}

export function AppShell() {
  const [desktop] = useState(() => isTauri())
  const [studioTab, setStudioTab] = useState<StudioTab>("image")
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hfToken, setHfToken] = useState("")
  const [hfTokenDirty, setHfTokenDirty] = useState(false)
  const [hfTokenSaving, setHfTokenSaving] = useState(false)
  const [hfTokenDialogOpen, setHfTokenDialogOpen] = useState(false)
  const [pendingInstallId, setPendingInstallId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [aspectId, setAspectId] = useState<string>("1:1")
  const [runtimes, setRuntimes] = useState<RuntimeInstall[]>([])
  const [gpu, setGpu] = useState<GpuInfo | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [comfyHealthy, setComfyHealthy] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const installingIdRef = useRef<string | null>(null)
  /** Completed-model bytes for the in-flight blueprint install (overall progress). */
  const installByteOffsetRef = useRef(0)
  const installByteTotalRef = useRef<number | null>(null)
  const [installProgress, setInstallProgress] =
    useState<BlueprintInstallProgress | null>(null)
  const [sizesProbing, setSizesProbing] = useState(false)
  const [detail, setDetail] = useState<BlueprintDetail | null>(null)
  const [controlValues, setControlValues] = useState<Record<string, unknown>>(
    {}
  )
  const [generating, setGenerating] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  /** Shown frame (stable until next frame finishes loading). */
  const [livePreviewSrc, setLivePreviewSrc] = useState<string | null>(null)
  /** Next frame loading behind the current one — swap on load to avoid flicker. */
  const [pendingPreviewSrc, setPendingPreviewSrc] = useState<string | null>(
    null
  )
  const [genStep, setGenStep] = useState<{ step: number; max: number } | null>(
    null
  )
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(
    null
  )
  const [prevNewestGalleryId, setPrevNewestGalleryId] = useState<string | null>(
    null
  )
  const pendingRecipeRef = useRef<GalleryRecipe | null>(null)
  const livePreviewSrcRef = useRef<string | null>(null)
  const pendingPreviewSrcRef = useRef<string | null>(null)

  function clearLivePreview() {
    livePreviewSrcRef.current = null
    pendingPreviewSrcRef.current = null
    setLivePreviewSrc(null)
    setPendingPreviewSrc(null)
    setGenStep(null)
  }

  function queueLivePreview(path: string) {
    const next = `${gallerySrc(path)}?t=${Date.now()}`
    if (!livePreviewSrcRef.current) {
      livePreviewSrcRef.current = next
      setLivePreviewSrc(next)
      pendingPreviewSrcRef.current = null
      setPendingPreviewSrc(null)
      return
    }
    pendingPreviewSrcRef.current = next
    setPendingPreviewSrc(next)
  }

  const tabBlueprints = useMemo(
    () =>
      studioTab === "creator"
        ? []
        : blueprints.filter((bp) => bp.category.toLowerCase() === studioTab),
    [blueprints, studioTab]
  )

  const tabGallery = useMemo(
    () =>
      studioTab === "creator"
        ? []
        : gallery.filter((item) => galleryItemCategory(item) === studioTab),
    [gallery, studioTab]
  )

  const newestGalleryId = tabGallery[0]?.id ?? null

  // Follow new arrivals / drop invalid selection without an effect.
  if (newestGalleryId !== prevNewestGalleryId) {
    setPrevNewestGalleryId(newestGalleryId)
    setSelectedGalleryId(newestGalleryId)
  } else if (
    selectedGalleryId != null &&
    !tabGallery.some((item) => item.id === selectedGalleryId)
  ) {
    setSelectedGalleryId(newestGalleryId)
  }

  const activeSelectedId =
    selectedId && tabBlueprints.some((bp) => bp.id === selectedId)
      ? selectedId
      : (tabBlueprints.find(isInstalled)?.id ?? tabBlueprints[0]?.id ?? null)

  const activeDetail =
    activeSelectedId && detail?.id === activeSelectedId ? detail : null

  const previewItem = useMemo(() => {
    if (selectedGalleryId) {
      const match = tabGallery.find((item) => item.id === selectedGalleryId)
      if (match) return match
    }
    return tabGallery[0] ?? null
  }, [tabGallery, selectedGalleryId])

  const selected = useMemo(
    () => tabBlueprints.find((bp) => bp.id === activeSelectedId) ?? null,
    [tabBlueprints, activeSelectedId]
  )

  const hasSizeControls = useMemo(
    () =>
      (activeDetail?.controls ?? []).some((c) => c.id === "width") &&
      (activeDetail?.controls ?? []).some((c) => c.id === "height"),
    [activeDetail]
  )

  const hasNegativePrompt = useMemo(
    () => (activeDetail?.controls ?? []).some((c) => c.id === "negative"),
    [activeDetail]
  )

  const advancedControls = useMemo(
    () =>
      (activeDetail?.controls ?? []).filter(
        (c) =>
          c.group === "advanced" &&
          c.id !== "prompt" &&
          c.id !== "negative" &&
          !(hasSizeControls && (c.id === "width" || c.id === "height"))
      ),
    [activeDetail, hasSizeControls]
  )

  const aspectLabel =
    ASPECT_PRESETS.find((a) => a.id === aspectId)?.label ?? aspectId

  useEffect(() => {
    if (!desktop) return

    let unlistenRuntimes: (() => void) | undefined
    let unlistenProgress: (() => void) | undefined
    let unlistenDownload: (() => void) | undefined
    let unlistenBlueprintProgress: (() => void) | undefined
    let unlistenBlueprintsUpdated: (() => void) | undefined
    let unlistenBlueprintSizes: (() => void) | undefined
    let unlistenBlueprintProbe: (() => void) | undefined
    let unlistenJobs: (() => void) | undefined
    let unlistenJobProgress: (() => void) | undefined
    let unlistenGallery: (() => void) | undefined
    let unlistenGalleryDeleted: (() => void) | undefined

    let lastSample: { t: number; bytes: number; url: string } | null = null
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
          setSelectedId((prev) => {
            if (prev && bps.some((bp) => bp.id === prev)) return prev
            const forTab = bps.filter(
              (bp) => bp.category.toLowerCase() === "image"
            )
            const installed = forTab.find(isInstalled)
            return installed?.id ?? forTab[0]?.id ?? null
          })
        })

        const [gpuInfo, rts, status, bps, items] = await Promise.all([
          detectGpu(),
          listRuntimes(),
          comfyuiStatus(),
          listBlueprints(),
          listGallery(),
        ])
        setGpu(gpuInfo)
        setRuntimes(rts)
        setBlueprints(bps)
        setGallery(items)
        setSelectedGalleryId((prev) => prev ?? items[0]?.id ?? null)
        setComfyHealthy(status.healthy)
        setSelectedId((prev) => {
          if (prev && bps.some((bp) => bp.id === prev)) return prev
          const forTab = bps.filter(
            (bp) => bp.category.toLowerCase() === "image"
          )
          const installed = forTab.find(isInstalled)
          return installed?.id ?? forTab[0]?.id ?? null
        })
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
      } catch (e) {
        setSizesProbing(false)
        notifyError(e instanceof Error ? e.message : String(e))
      }
    }

    void load()

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
        setRuntimeMessage("ComfyUI ready")
        setRuntimeBusy(false)
      } else if (runtime.status === "running") {
        setComfyHealthy(true)
        setRuntimeMessage("ComfyUI is running")
        setRuntimeBusy(false)
        notifyProgress("runtime", "ComfyUI ready", "Running", true)
      } else if (runtime.status === "error" && runtime.error) {
        notifyError(runtime.error, "ComfyUI error")
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
        notifyProgress("runtime", "ComfyUI ready", p.message, true)
      } else if (p.stage === "error") {
        setRuntimeBusy(false)
        setComfyHealthy(false)
        notifyError(p.message, "ComfyUI error")
      } else {
        notifyProgress("runtime", "ComfyUI", p.message)
      }
    }).then((u) => {
      unlistenProgress = u
    })

    void onDownloadProgress((p) => {
      const now = performance.now()
      const bpId = installingIdRef.current
      // Offset is owned by blueprints://progress (completed models only).
      // Live downloads add the current file's transferred bytes on top.
      const overallDownloaded = bpId
        ? installByteOffsetRef.current + p.downloaded
        : p.downloaded
      if (p.done) {
        lastSample = null
        emaSpeed = 0
      } else if (
        (bpId ? installByteTotalRef.current : p.total) != null &&
        (bpId ? (installByteTotalRef.current as number) : (p.total as number)) >
          overallDownloaded
      ) {
        if (lastSample && lastSample.url === p.url) {
          const dt = (now - lastSample.t) / 1000
          const db = overallDownloaded - lastSample.bytes
          if (dt >= 0.2 && db >= 0) {
            const instant = db / dt
            emaSpeed = emaSpeed > 0 ? emaSpeed * 0.7 + instant * 0.3 : instant
          }
        } else {
          emaSpeed = 0
        }
        lastSample = { t: now, bytes: overallDownloaded, url: p.url }
      }

      if (bpId) {
        // Prefer overall blueprint total; grow it if this file reveals a larger sum.
        let total = installByteTotalRef.current
        if (p.total != null) {
          const fromFileTotal = installByteOffsetRef.current + p.total
          total = total != null ? Math.max(total, fromFileTotal) : fromFileTotal
          installByteTotalRef.current = total
        }
        setInstallProgress((prev) => ({
          blueprintId: bpId,
          stage: prev?.stage ?? "download",
          message: prev?.message ?? "Downloading…",
          modelIndex: prev?.modelIndex ?? 0,
          modelTotal: prev?.modelTotal ?? 0,
          downloaded: overallDownloaded,
          total,
          bytesPerSec: emaSpeed,
        }))
        return
      }

      // Runtime / other downloads (e.g. Comfy portable) — keep toast.
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
      notifyProgress(
        "download",
        p.done ? "Download complete" : "Downloading",
        msg,
        p.done
      )
    }).then((u) => {
      unlistenDownload = u
    })

    void onBlueprintProgress((p) => {
      if (p.stage === "done") {
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
        lastSample = null
        emaSpeed = 0
        installByteOffsetRef.current = 0
        installByteTotalRef.current = null
        notifySuccess("Blueprint ready", p.message)
        return
      }
      if (p.stage === "error") {
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
        lastSample = null
        emaSpeed = 0
        installByteOffsetRef.current = 0
        installByteTotalRef.current = null
        notifyError(p.message, "Blueprint install failed")
        return
      }

      if (p.blueprintId) {
        installingIdRef.current = p.blueprintId
        setInstallingId(p.blueprintId)
      }
      // Rust sends overall offset (completed models) before each file download.
      if (typeof p.downloaded === "number") {
        installByteOffsetRef.current = p.downloaded
      }
      if (typeof p.total === "number") {
        installByteTotalRef.current = p.total
      }
      setInstallProgress((prev) => ({
        blueprintId: p.blueprintId || prev?.blueprintId || "",
        stage: p.stage,
        message: p.message,
        modelIndex: p.modelIndex,
        modelTotal: p.modelTotal,
        downloaded:
          typeof p.downloaded === "number"
            ? p.downloaded
            : p.stage === "download" && prev?.blueprintId === p.blueprintId
              ? prev.downloaded
              : 0,
        total:
          typeof p.total === "number"
            ? p.total
            : p.stage === "download" && prev?.blueprintId === p.blueprintId
              ? prev.total
              : null,
        bytesPerSec:
          p.stage === "download" && prev?.blueprintId === p.blueprintId
            ? prev.bytesPerSec
            : 0,
      }))
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
      // Auto-start emits a separate "runtime" loading toast; clear it once
      // generation has moved on (or finished). Progress lives in the composer bar.
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
        notifyProgress("runtime", "Starting ComfyUI", p.message)
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
      setStudioTab(category)
      setSelectedGalleryId(item.id)
      setGalleryOpen(true)
    }).then((u) => {
      unlistenGallery = u
    })

    void onGalleryDeleted((id) => {
      setGallery((prev) => prev.filter((item) => item.id !== id))
      setSelectedGalleryId((current) => (current === id ? null : current))
    }).then((u) => {
      unlistenGalleryDeleted = u
    })

    return () => {
      unlistenRuntimes?.()
      unlistenProgress?.()
      unlistenDownload?.()
      unlistenBlueprintProgress?.()
      unlistenBlueprintsUpdated?.()
      unlistenBlueprintSizes?.()
      unlistenBlueprintProbe?.()
      unlistenJobs?.()
      unlistenJobProgress?.()
      unlistenGallery?.()
      unlistenGalleryDeleted?.()
    }
  }, [desktop])

  useEffect(() => {
    const el = promptRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 160)}px`
  }, [prompt])

  useEffect(() => {
    if (!activeSelectedId || !desktop) return
    let cancelled = false
    void getOfficialBlueprint(activeSelectedId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        const recipe = pendingRecipeRef.current
        pendingRecipeRef.current = null
        // Always load this blueprint's defaults (don't keep prior blueprint values).
        const next: Record<string, unknown> = {}
        for (const c of d.controls) {
          if (c.default !== undefined) {
            next[c.id] = c.default
          }
        }
        // Reuse only restores prompts + size; advanced stays on blueprint defaults.
        setControlValues(recipe ? applyReuseSizeAndPrompts(next, recipe) : next)
        const hasW = d.controls.some((c) => c.id === "width")
        const hasH = d.controls.some((c) => c.id === "height")
        if (hasW && hasH) {
          const preset = ASPECT_PRESETS.find(
            (a) =>
              a.width === Number(next.width) && a.height === Number(next.height)
          )
          if (preset) {
            setAspectId(preset.id)
          }
        }
        if (recipe?.prompt) {
          setPrompt(recipe.prompt)
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

  const comfy = runtimes.find((r) => r.engine === "comfyui")

  useEffect(() => {
    if (!settingsOpen || !isTauri()) return
    let cancelled = false
    void listSettings()
      .then((s) => {
        if (cancelled) return
        setHfToken(s.huggingface_token ?? "")
        setHfTokenDirty(false)
      })
      .catch((e) =>
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
      )
    return () => {
      cancelled = true
    }
  }, [settingsOpen])

  async function handleSaveHfToken() {
    setHfTokenSaving(true)
    try {
      await setSetting("huggingface_token", hfToken.trim())
      setHfTokenDirty(false)
      notifySuccess(
        "Hugging Face token saved",
        hfToken.trim()
          ? "Gated model downloads will use this token."
          : "Token cleared."
      )
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Settings")
    } finally {
      setHfTokenSaving(false)
    }
  }

  async function startBlueprintInstall(id: string) {
    installingIdRef.current = id
    setInstallingId(id)
    const bp = blueprints.find((b) => b.id === id)
    installByteOffsetRef.current = 0
    installByteTotalRef.current = bp?.totalSizeBytes ?? null
    setInstallProgress({
      blueprintId: id,
      stage: "start",
      message: "Starting model download…",
      modelIndex: 0,
      modelTotal: bp?.modelCount ?? 0,
      downloaded: 0,
      total: bp?.totalSizeBytes ?? null,
      bytesPerSec: 0,
    })
    notifyDismiss("download")
    notifyDismiss("blueprint")
    try {
      await installOfficialBlueprint(id)
    } catch (e) {
      installingIdRef.current = null
      setInstallingId(null)
      setInstallProgress(null)
      installByteOffsetRef.current = 0
      installByteTotalRef.current = null
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Blueprint install failed"
      )
    }
  }

  async function handleInstallBlueprint(id: string) {
    const bp = blueprints.find((b) => b.id === id)
    if (bp?.requiresHfToken) {
      try {
        const settings = await listSettings()
        const token = (settings.huggingface_token ?? "").trim()
        if (!token) {
          setPendingInstallId(id)
          setHfTokenDialogOpen(true)
          return
        }
      } catch (e) {
        notifyError(e instanceof Error ? e.message : String(e), "Settings")
        return
      }
    }
    await startBlueprintInstall(id)
  }

  async function handleHfTokenDialogConfirm(token: string) {
    const id = pendingInstallId
    await setSetting("huggingface_token", token)
    setHfToken(token)
    setHfTokenDirty(false)
    setHfTokenDialogOpen(false)
    setPendingInstallId(null)
    notifySuccess("Hugging Face token saved", "Continuing model download…")
    if (id) await startBlueprintInstall(id)
  }

  async function handleInstallComfy() {
    setRuntimeBusy(true)
    setRuntimeMessage("Queued ComfyUI install…")
    notifyProgress("runtime", "Installing ComfyUI", "Queued install…")
    try {
      await installComfyui()
    } catch (e) {
      setRuntimeBusy(false)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "ComfyUI install failed"
      )
    }
  }

  async function handleStartComfy() {
    setRuntimeBusy(true)
    setRuntimeMessage("Starting ComfyUI…")
    notifyProgress("runtime", "Starting ComfyUI")
    try {
      await startComfyui()
    } catch (e) {
      setRuntimeBusy(false)
      setComfyHealthy(false)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Failed to start ComfyUI"
      )
    }
  }

  async function handleStopComfy() {
    setRuntimeBusy(true)
    try {
      await stopComfyui()
      setComfyHealthy(false)
      setRuntimeMessage("ComfyUI stopped")
      notifySuccess("ComfyUI stopped")
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Failed to stop ComfyUI"
      )
    } finally {
      setRuntimeBusy(false)
    }
  }

  function applyAspect(id: string) {
    const preset = ASPECT_PRESETS.find((a) => a.id === id)
    if (!preset) return
    setAspectId(id)
    setControlValues((prev) => ({
      ...prev,
      width: preset.width,
      height: preset.height,
    }))
  }

  async function handleGenerate() {
    if (!selected) {
      setPickerOpen(true)
      return
    }
    if (
      !isInstalled(selected) &&
      (selected.modelsReady ?? 0) < (selected.modelCount ?? 1)
    ) {
      setPickerOpen(true)
      notifyInfo(
        "Install models first",
        "Install this blueprint’s models before generating.",
        "generate"
      )
      return
    }
    if (!prompt.trim()) {
      notifyInfo("Prompt required", "Enter a prompt first.", "generate")
      return
    }
    setGenerating(true)
    clearLivePreview()
    try {
      const values: Record<string, unknown> = {
        ...controlValues,
        prompt: prompt.trim(),
      }
      if (hasNegativePrompt) {
        values.negative = String(controlValues.negative ?? "").trim()
      } else {
        delete values.negative
      }
      const job = await generateImage(selected.id, values)
      setActiveJobId(job.id)
    } catch (e) {
      setGenerating(false)
      setActiveJobId(null)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Generation failed"
      )
    }
  }

  async function handleCancel() {
    if (!activeJobId) return
    try {
      await cancelJob(activeJobId)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleDeleteGalleryItem(id: string) {
    try {
      await deleteGalleryItem(id)
      notifySuccess("Image deleted")
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Delete failed")
      throw e
    }
  }

  function handleReuseGalleryItem(item: GalleryItem) {
    const recipe = parseGalleryRecipe(item)
    if (!recipe) {
      notifyInfo("No settings", "This image has no reusable settings.", "reuse")
      return
    }

    setStudioTab(recipe.category)
    setSelectedGalleryId(item.id)

    if (recipe.prompt) {
      setPrompt(recipe.prompt)
    }

    const width = Number(recipe.values.width)
    const height = Number(recipe.values.height)
    if (Number.isFinite(width) && Number.isFinite(height)) {
      const preset = ASPECT_PRESETS.find(
        (a) => a.width === width && a.height === height
      )
      if (preset) setAspectId(preset.id)
    }

    if (recipe.blueprintId) {
      if (
        recipe.blueprintId === activeSelectedId &&
        activeDetail?.id === recipe.blueprintId
      ) {
        // Same blueprint — selection won't change, so reset advanced to defaults here.
        const defaults: Record<string, unknown> = {}
        for (const c of activeDetail.controls) {
          if (c.default !== undefined) defaults[c.id] = c.default
        }
        setControlValues(applyReuseSizeAndPrompts(defaults, recipe))
      } else {
        pendingRecipeRef.current = recipe
        setSelectedId(recipe.blueprintId)
      }
    } else {
      setControlValues((prev) => applyReuseSizeAndPrompts(prev, recipe))
    }

    notifySuccess(
      "Settings loaded",
      recipe.blueprintName
        ? `From ${recipe.blueprintName}`
        : "From gallery image"
    )
  }

  if (!desktop) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open Gen AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Local store and host APIs run inside the Tauri desktop shell. Start
          with <code className="font-mono text-xs">bun run desktop</code>.
        </p>
      </div>
    )
  }

  const studioLabel =
    STUDIO_TABS.find((tab) => tab.id === studioTab)?.label ?? "Image"
  const canGenerate = studioTab === "image"
  const showCreator = studioTab === "creator"
  const showGalleryRail = !showCreator

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <header className="z-20 flex shrink-0 items-center justify-between gap-4 px-5 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LayersIcon className="size-4 text-primary" />
            <span className="hidden sm:inline">Open Gen AI</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            {STUDIO_TABS.map((tab) => {
              const active = studioTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudioTab(tab.id)}
                  className={cn(
                    "relative px-3 py-1.5 transition-colors",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {active ? (
                    <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {gpu?.available ? (
            <p className="hidden max-w-[14rem] truncate text-right text-[11px] text-muted-foreground lg:block">
              {gpu.name}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
            Settings
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0 flex flex-col transition-[right] duration-300 ease-out"
          style={
            showGalleryRail && galleryOpen
              ? { right: "min(22rem, 42vw)" }
              : undefined
          }
        >
          {showCreator ? (
            <CreatorPanel
              comfyHealthy={comfyHealthy}
              onBlueprintsChanged={() => {
                void listBlueprints()
                  .then(setBlueprints)
                  .catch((e) =>
                    notifyError(e instanceof Error ? e.message : String(e))
                  )
              }}
            />
          ) : (
            <>
              <main className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-4 md:px-10">
                {livePreviewSrc || pendingPreviewSrc ? (
                  <div className="relative flex h-full min-h-0 w-full items-center justify-center">
                    {livePreviewSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={livePreviewSrc}
                        alt=""
                        className="h-full max-h-full w-auto max-w-full rounded-3xl object-contain drop-shadow-lg"
                      />
                    ) : null}
                    {pendingPreviewSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={pendingPreviewSrc}
                        src={pendingPreviewSrc}
                        alt=""
                        className="pointer-events-none absolute h-full max-h-full w-auto max-w-full rounded-3xl object-contain opacity-0"
                        onLoad={() => {
                          // Closure matches this keyed frame (not a newer pending).
                          const loaded = pendingPreviewSrc
                          livePreviewSrcRef.current = loaded
                          setLivePreviewSrc(loaded)
                          if (pendingPreviewSrcRef.current === loaded) {
                            pendingPreviewSrcRef.current = null
                            setPendingPreviewSrc(null)
                          }
                        }}
                      />
                    ) : null}
                  </div>
                ) : previewItem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={gallerySrc(previewItem.path)}
                    alt=""
                    className="h-full max-h-full w-auto max-w-full rounded-3xl object-contain drop-shadow-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_48px_-8px] shadow-primary/40">
                      <ImageIcon className="size-9 text-primary" />
                    </div>
                    <h1 className="font-heading text-4xl font-semibold tracking-tight uppercase md:text-5xl">
                      {studioLabel} Studio
                    </h1>
                    <p className="mt-3 max-w-md text-sm text-muted-foreground">
                      {canGenerate
                        ? "Local blueprints on your GPU — install a model, describe a scene, generate."
                        : `${studioLabel} blueprints are coming next. Switch to Image to generate now.`}
                    </p>
                  </div>
                )}
              </main>

              <div className="pointer-events-none relative z-40 shrink-0 px-4 pt-1 pb-5 md:px-8">
                <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#141416]/95 shadow-2xl backdrop-blur-xl">
                  <div className="bg-black/25 px-4 pt-3.5 pb-3 md:px-5">
                    <textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={
                        canGenerate
                          ? "Describe the image you want to create."
                          : `${studioLabel} generation is not available yet.`
                      }
                      disabled={!canGenerate}
                      rows={1}
                      className={cn(
                        "min-h-11 w-full resize-none overflow-y-auto bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60",
                        // Match ScrollArea thumb — native scroll stays smooth in a textarea.
                        "[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--foreground)_20%,transparent)_transparent]",
                        "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent",
                        "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20",
                        "[&::-webkit-scrollbar-track]:bg-transparent"
                      )}
                    />
                    {hasNegativePrompt ? (
                      <textarea
                        value={String(controlValues.negative ?? "")}
                        onChange={(e) =>
                          setControlValues((prev) => ({
                            ...prev,
                            negative: e.target.value,
                          }))
                        }
                        placeholder="Negative prompt — what to avoid"
                        disabled={!canGenerate}
                        rows={2}
                        className={cn(
                          "mt-2 min-h-10 w-full resize-none overflow-y-auto border-t border-white/8 bg-transparent pt-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60",
                          "[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--foreground)_20%,transparent)_transparent]",
                          "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent",
                          "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20",
                          "[&::-webkit-scrollbar-track]:bg-transparent"
                        )}
                      />
                    ) : null}
                  </div>
                  {/* Same 1px as the old border — fill grows while sampling. */}
                  <div
                    className="relative h-px w-full bg-white/8"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={genStep?.max ?? 100}
                    aria-valuenow={
                      genStep?.step ?? (generating ? 0 : undefined)
                    }
                    aria-label="Generation progress"
                  >
                    {generating ? (
                      <div
                        className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300 ease-out"
                        style={{
                          width: genStep
                            ? `${Math.min(
                                100,
                                (genStep.step / Math.max(genStep.max, 1)) * 100
                              )}%`
                            : "0%",
                        }}
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                      onClick={() => setPickerOpen(true)}
                      disabled={!canGenerate}
                    >
                      <LayersIcon className="size-3.5 text-primary" />
                      <span className="max-w-[10rem] truncate">
                        {selected?.name ?? "Choose blueprint"}
                      </span>
                      <ChevronDownIcon className="size-3.5 opacity-60" />
                    </Button>

                    {hasSizeControls ? (
                      <Menu>
                        <MenuTrigger
                          render={
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="rounded-full"
                            />
                          }
                        >
                          <RatioIcon className="size-3.5" />
                          {aspectLabel}
                          <ChevronDownIcon className="size-3.5 opacity-60" />
                        </MenuTrigger>
                        <MenuPopup align="start" side="top" sideOffset={8}>
                          {ASPECT_PRESETS.map((preset) => (
                            <MenuItem
                              key={preset.id}
                              onClick={() => applyAspect(preset.id)}
                            >
                              <SquareIcon className="size-3.5 opacity-60" />
                              {preset.label}
                              <span className="ms-auto text-xs text-muted-foreground">
                                {preset.width}×{preset.height}
                              </span>
                            </MenuItem>
                          ))}
                        </MenuPopup>
                      </Menu>
                    ) : null}

                    <Button
                      type="button"
                      size="sm"
                      variant={advancedOpen ? "default" : "secondary"}
                      className="rounded-full"
                      onClick={() => setAdvancedOpen((v) => !v)}
                      disabled={!canGenerate}
                    >
                      <SlidersHorizontalIcon className="size-3.5" />
                      Advanced
                      <ChevronDownIcon
                        className={cn(
                          "size-3.5 opacity-60 transition-transform",
                          advancedOpen && "rotate-180"
                        )}
                      />
                    </Button>

                    <div className="ms-auto flex items-center gap-2">
                      {generating ? (
                        <Button
                          type="button"
                          size="lg"
                          variant="outline"
                          className="rounded-full px-4 before:hidden"
                          onClick={() => void handleCancel()}
                        >
                          <XIcon />
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="lg"
                        className="rounded-full px-5 font-semibold"
                        disabled={generating || !canGenerate}
                        onClick={() => void handleGenerate()}
                      >
                        <SparklesIcon />
                        {generating
                          ? genStep
                            ? `${genStep.step}/${genStep.max}`
                            : "Generating…"
                          : "Generate"}
                      </Button>
                    </div>
                  </div>

                  {advancedOpen && canGenerate ? (
                    <div className="border-t border-white/8 px-3 pb-3 md:px-4">
                      <div className="mt-3 grid gap-3 rounded-2xl border border-white/8 bg-black/20 px-3 py-3 sm:grid-cols-2">
                        {advancedControls.length === 0 ? (
                          <p className="text-xs text-muted-foreground sm:col-span-2">
                            No advanced controls for this blueprint.
                          </p>
                        ) : (
                          advancedControls.map((control) => {
                            if (
                              control.type === "number" ||
                              control.type === "slider"
                            ) {
                              const value = Number(
                                controlValues[control.id] ??
                                  control.default ??
                                  0
                              )
                              return (
                                <label
                                  key={control.id}
                                  className="flex flex-col gap-1.5 text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {control.label || control.id}
                                  </span>
                                  <NumberField
                                    size="sm"
                                    value={Number.isFinite(value) ? value : 0}
                                    onValueChange={(v) =>
                                      setControlValues((prev) => ({
                                        ...prev,
                                        [control.id]: v ?? 0,
                                      }))
                                    }
                                  >
                                    <NumberFieldGroup>
                                      <NumberFieldInput />
                                    </NumberFieldGroup>
                                  </NumberField>
                                </label>
                              )
                            }
                            return (
                              <label
                                key={control.id}
                                className="flex flex-col gap-1.5 text-xs sm:col-span-2"
                              >
                                <span className="text-muted-foreground">
                                  {control.label || control.id}
                                </span>
                                <input
                                  className="h-8 rounded-lg border border-input bg-background px-2"
                                  value={String(
                                    controlValues[control.id] ?? ""
                                  )}
                                  onChange={(e) =>
                                    setControlValues((prev) => ({
                                      ...prev,
                                      [control.id]: e.target.value,
                                    }))
                                  }
                                />
                              </label>
                            )
                          })
                        )}
                        {selected && !isInstalled(selected) ? (
                          <p className="text-xs text-warning-foreground sm:col-span-2">
                            Models not installed yet — open the blueprint picker
                            to download.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>

        {showGalleryRail ? (
          <>
            <button
              type="button"
              onClick={() => setGalleryOpen((open) => !open)}
              className={cn(
                "absolute top-1/2 z-30 flex h-20 w-8 -translate-y-1/2 flex-col items-center justify-center gap-1 border border-white/10 bg-[#141416]/90 text-muted-foreground shadow-lg backdrop-blur-md transition-[right,colors] duration-300 hover:text-foreground",
                galleryOpen
                  ? "rounded-l-lg rounded-r-none border-r-0"
                  : "rounded-l-lg border-r-0"
              )}
              style={{
                right: galleryOpen ? "min(22rem, 42vw)" : 0,
              }}
              aria-label={galleryOpen ? "Close gallery" : "Open gallery"}
              title={galleryOpen ? "Close gallery" : "Open gallery"}
            >
              <ImagesIcon className="size-3.5" />
              {galleryOpen ? (
                <ChevronRightIcon className="size-4" />
              ) : (
                <ChevronLeftIcon className="size-4" />
              )}
              {tabGallery.length > 0 ? (
                <span className="text-[10px] font-medium text-primary">
                  {tabGallery.length}
                </span>
              ) : null}
            </button>

            <GalleryPanel
              open={galleryOpen}
              title={`${studioLabel} gallery`}
              items={tabGallery}
              selectedId={selectedGalleryId}
              onSelect={setSelectedGalleryId}
              onDelete={handleDeleteGalleryItem}
              onReuse={handleReuseGalleryItem}
            />
          </>
        ) : null}
      </div>

      <BlueprintPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        blueprints={tabBlueprints}
        selectedId={activeSelectedId}
        installingId={installingId}
        installProgress={installProgress}
        sizesProbing={sizesProbing}
        onSelect={setSelectedId}
        onInstall={(id) => void handleInstallBlueprint(id)}
      />

      <HfTokenDialog
        key={
          hfTokenDialogOpen
            ? (pendingInstallId ?? "hf-token")
            : "hf-token-closed"
        }
        open={hfTokenDialogOpen}
        onOpenChange={(open) => {
          setHfTokenDialogOpen(open)
          if (!open) setPendingInstallId(null)
        }}
        blueprintName={
          pendingInstallId
            ? (blueprints.find((b) => b.id === pendingInstallId)?.name ?? null)
            : null
        }
        onConfirm={handleHfTokenDialogConfirm}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Runtime and host preferences for this machine.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4 text-sm">
            <div className="rounded-xl border p-4">
              <p className="font-medium">ComfyUI</p>
              <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                <p>status: {comfy?.status ?? "—"}</p>
                <p>healthy: {comfyHealthy ? "yes" : "no"}</p>
                <p>port: {comfy?.port ?? "—"}</p>
                <p className="truncate">path: {comfy?.installPath || "—"}</p>
              </div>
              {runtimeMessage ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {runtimeMessage}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={runtimeBusy}
                  onClick={handleInstallComfy}
                >
                  Reinstall
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    runtimeBusy ||
                    !comfy?.installPath ||
                    comfy.status === "installing" ||
                    comfy.status === "starting" ||
                    comfy.status === "running"
                  }
                  onClick={handleStartComfy}
                >
                  Start
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    runtimeBusy ||
                    (comfy?.status !== "running" &&
                      comfy?.status !== "starting")
                  }
                  onClick={handleStopComfy}
                >
                  Stop
                </Button>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <p className="font-medium">Hugging Face</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Access token for gated models (e.g. Black Forest Labs). Accept
                the model license on Hugging Face first, then paste a token with
                read access.
              </p>
              <label className="mt-3 flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">Access token</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="hf_…"
                  value={hfToken}
                  onChange={(e) => {
                    setHfToken(e.target.value)
                    setHfTokenDirty(true)
                  }}
                  className="font-mono text-xs"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={hfTokenSaving || !hfTokenDirty}
                  onClick={() => void handleSaveHfToken()}
                >
                  {hfTokenSaving ? "Saving…" : "Save token"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    void openExternalUrl(
                      "https://huggingface.co/settings/tokens/new?preset=read-only"
                    ).catch((e) =>
                      notifyError(
                        e instanceof Error ? e.message : String(e),
                        "Could not open browser"
                      )
                    )
                  }}
                >
                  Get a token
                </button>
              </div>
            </div>

            {gpu ? (
              <p className="text-xs text-muted-foreground">
                {gpu.available
                  ? `${gpu.name} · ${gpu.memoryTotal} · driver ${gpu.driverVersion}`
                  : (gpu.error ?? "No NVIDIA GPU detected")}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Close
            </DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}
