"use client"

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DicesIcon,
  HardDriveIcon,
  HistoryIcon,
  ImageIcon,
  ImagesIcon,
  LayersIcon,
  RatioIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import {
  BlueprintPickerDialog,
  type BlueprintInstallProgress,
  type DownloadModelItem,
} from "@/components/blueprint-picker-dialog"
import { CreatorPanel } from "@/components/creator-panel"
import {
  DownloadsPanel,
  type DownloadHistoryEntry,
} from "@/components/downloads-panel"
import { GalleryPanel } from "@/components/gallery-panel"
import { CivitaiTokenDialog } from "@/components/civitai-token-dialog"
import { HfTokenDialog } from "@/components/hf-token-dialog"
import { AdvancedPanel } from "@/components/advanced-panel"
import { LoraPickerDialog } from "@/components/lora-picker-dialog"
import { LoraStack } from "@/components/lora-stack"
import { SideRailHandle, SIDE_RAIL_WIDTH } from "@/components/side-rail"
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { WithTooltip } from "@/components/ui/tooltip"
import { ModelsLibraryDialog } from "@/components/models-library-dialog"
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
import { Input } from "@/components/ui/input"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import {
  cancelBlueprintInstall,
  cancelJob,
  comfyuiStatus,
  deleteGalleryItem,
  detectGpu,
  galleryItemCategory,
  gallerySrc,
  generateImage,
  getBlueprint,
  getOfficialBlueprint,
  installComfyui,
  deleteUserLora,
  installLoraVariant,
  installOfficialBlueprint,
  isTauri,
  listGallery,
  listBlueprints,
  listLoras,
  listRuntimes,
  listSettings,
  openExternalUrl,
  setSetting,
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
  onDownloadProgress,
  onLoraProgress,
  onLorasUpdated,
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
  type LoraPack,
  type LoraStackEntry,
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
import {
  ASPECT_RATIOS,
  SIDE_LENGTH_DEFAULT,
  SIDE_LENGTH_MAX,
  SIDE_LENGTH_MIN,
  SIDE_LENGTH_PRESETS,
  SIDE_LENGTH_STEP,
  sizeFromAspectAndSide,
  syncSizeControls,
  type AspectRatio,
} from "@/lib/image-size"
import { cn } from "@/lib/utils"

const STUDIO_TABS: { id: StudioTab; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
  { id: "creator", label: "Creator" },
  { id: "downloads", label: "Downloads" },
]

const SETTING_SELECTED_BLUEPRINT = "selected_blueprint_id"

function pickDefaultBlueprintId(
  bps: Blueprint[],
  preferred: string | null | undefined,
  tab: StudioTab = "image"
): string | null {
  if (preferred && bps.some((bp) => bp.id === preferred)) return preferred
  const forTab = bps.filter((bp) => bp.category.toLowerCase() === tab)
  const installed = forTab.find(isInstalled)
  return installed?.id ?? forTab[0]?.id ?? null
}

/** Mini frame for aspect picker tiles (max edge ~14px). */
function aspectFrameStyle(aspect: AspectRatio): CSSProperties {
  const max = 14
  const scale = max / Math.max(aspect.w, aspect.h)
  return {
    width: Math.max(5, Math.round(aspect.w * scale)),
    height: Math.max(5, Math.round(aspect.h * scale)),
  }
}

/**
 * Largest box with this aspect that fits a size container (needs container-type: size
 * so both cqi and cqb resolve — inline-size alone breaks portrait).
 */
function stageFrameStyle(width: number, height: number): CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100cqi, calc(100cqb * ${width} / ${height}))`,
    height: `min(100cqb, calc(100cqi * ${height} / ${width}))`,
    maxWidth: "100%",
    maxHeight: "100%",
  }
}

function StageImage({
  src,
  width,
  height,
  className,
  onLoad,
  overlay,
}: {
  src: string
  width: number
  height: number
  className?: string
  onLoad?: () => void
  /** Hidden preload layer for the next preview frame. */
  overlay?: boolean
}) {
  // Prefer decoded pixels over control/recipe size — wrong stage aspect letterboxes
  // with object-contain and makes wide images look sharp-cornered.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setNatural(null)
  }
  const frameW = natural?.w ?? width
  const frameH = natural?.h ?? height

  const frame = (
    <div
      className={cn("rounded-3xl drop-shadow-lg", !overlay && className)}
      style={stageFrameStyle(frameW, frameH)}
    >
      <div className="size-full overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onLoad={(e) => {
            const im = e.currentTarget
            if (im.naturalWidth > 0 && im.naturalHeight > 0) {
              setNatural({ w: im.naturalWidth, h: im.naturalHeight })
            }
            onLoad?.()
          }}
          className="block size-full object-contain"
        />
      </div>
    </div>
  )
  if (overlay) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0",
          className
        )}
      >
        {frame}
      </div>
    )
  }
  return frame
}

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

/** Full gallery reuse: every stored control except prompt/loras (those are separate state). */
function applyReuseAllSettings(
  base: Record<string, unknown>,
  recipe: GalleryRecipe
): Record<string, unknown> {
  const next = { ...base }
  for (const [key, value] of Object.entries(recipe.values)) {
    if (key === "prompt" || key === "loras") continue
    next[key] = value
  }
  return next
}

function lorasFromRecipe(
  recipe: GalleryRecipe,
  packs: LoraPack[]
): LoraStackEntry[] {
  const raw = recipe.values.loras
  if (!Array.isArray(raw)) return []
  const out: LoraStackEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as {
      id?: unknown
      filename?: unknown
      strength?: unknown
    }
    const strength =
      typeof row.strength === "number" && Number.isFinite(row.strength)
        ? row.strength
        : null
    if (strength == null) continue
    if (typeof row.id === "string" && row.id) {
      out.push({ id: row.id, strength })
      continue
    }
    // Older gallery items only stored resolved filename — map back to pack id.
    if (typeof row.filename === "string" && row.filename) {
      const pack = packs.find((p) =>
        p.variants.some((v) => v.filename === row.filename)
      )
      if (pack) out.push({ id: pack.id, strength })
    }
  }
  return out
}

const subscribeNoop = () => () => {}

export function AppShell() {
  // Server + hydration assume desktop (Tauri-first) so SSR HTML matches the shell.
  // Browser `next dev` without Tauri flips to the fallback after hydrate.
  const desktop = useSyncExternalStore(subscribeNoop, isTauri, () => true)
  const [studioTab, setStudioTab] = useState<StudioTab>("image")
  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
  const blueprintsRef = useRef<Blueprint[]>([])
  const [blueprintsLoaded, setBlueprintsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const preferredBlueprintIdRef = useRef<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editBlueprintId, setEditBlueprintId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  const [loraPickerOpen, setLoraPickerOpen] = useState(false)
  const [loraPacks, setLoraPacks] = useState<LoraPack[]>([])
  const loraPacksRef = useRef<LoraPack[]>([])
  const [loraStack, setLoraStack] = useState<LoraStackEntry[]>([])
  const [loraInstallingKey, setLoraInstallingKey] = useState<string | null>(
    null
  )
  const [hfToken, setHfToken] = useState("")
  const [hfTokenDirty, setHfTokenDirty] = useState(false)
  const [hfTokenSaving, setHfTokenSaving] = useState(false)
  const [hfTokenDialogOpen, setHfTokenDialogOpen] = useState(false)
  const [civitaiToken, setCivitaiToken] = useState("")
  const [civitaiTokenDirty, setCivitaiTokenDirty] = useState(false)
  const [civitaiTokenSaving, setCivitaiTokenSaving] = useState(false)
  const [civitaiTokenDialogOpen, setCivitaiTokenDialogOpen] = useState(false)
  const [pendingInstallId, setPendingInstallId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [aspectId, setAspectId] = useState<string>("1:1")
  const [sideLength, setSideLength] = useState(SIDE_LENGTH_DEFAULT)
  const aspectIdRef = useRef(aspectId)
  const sideLengthRef = useRef(sideLength)
  const [runtimes, setRuntimes] = useState<RuntimeInstall[]>([])
  const [gpu, setGpu] = useState<GpuInfo | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [comfyHealthy, setComfyHealthy] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const installingIdRef = useRef<string | null>(null)
  /** Blueprint ids waiting after the active install. */
  const [installQueue, setInstallQueue] = useState<string[]>([])
  const installQueueRef = useRef<string[]>([])
  const pumpInstallQueueRef = useRef<() => void>(() => {})
  /** Missing models per blueprint (for per-file Downloads queue). */
  const [pendingByBlueprint, setPendingByBlueprint] = useState<
    Record<string, DownloadModelItem[]>
  >({})
  /** Completed-model bytes for the in-flight blueprint install (overall progress). */
  const installByteOffsetRef = useRef(0)
  const installByteTotalRef = useRef<number | null>(null)
  const [installProgress, setInstallProgress] =
    useState<BlueprintInstallProgress | null>(null)
  const [downloadHistory, setDownloadHistory] = useState<
    DownloadHistoryEntry[]
  >([])
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

  const tabBlueprints = useMemo(() => {
    if (studioTab === "creator") return []
    if (studioTab === "downloads") return blueprints
    return blueprints.filter((bp) => bp.category.toLowerCase() === studioTab)
  }, [blueprints, studioTab])

  const tabGallery = useMemo(() => {
    if (studioTab === "creator" || studioTab === "downloads") return []
    return gallery.filter((item) => galleryItemCategory(item) === studioTab)
  }, [gallery, studioTab])

  const newestGalleryId = tabGallery[0]?.id ?? null

  // Drop invalid selection without an effect; never auto-select.
  if (newestGalleryId !== prevNewestGalleryId) {
    setPrevNewestGalleryId(newestGalleryId)
  }
  if (
    selectedGalleryId != null &&
    !tabGallery.some((item) => item.id === selectedGalleryId)
  ) {
    setSelectedGalleryId(null)
  }

  const activeSelectedId =
    selectedId && tabBlueprints.some((bp) => bp.id === selectedId)
      ? selectedId
      : (tabBlueprints.find(isInstalled)?.id ?? tabBlueprints[0]?.id ?? null)

  const activeDetail =
    activeSelectedId && detail?.id === activeSelectedId ? detail : null

  const previewItem = useMemo(() => {
    if (!selectedGalleryId) return null
    return tabGallery.find((item) => item.id === selectedGalleryId) ?? null
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

  const cfgValue = Number(
    controlValues.cfg ??
      activeDetail?.controls?.find((c) => c.id === "cfg")?.default ??
      1
  )

  const supportsLoras = Boolean(activeDetail?.capabilities?.loras)
  const activeArch = activeDetail?.arch ?? null
  const activeLoraStack = useMemo(() => {
    if (!activeArch) return [] as LoraStackEntry[]
    return loraStack.filter((entry) =>
      loraPacks.some(
        (p) =>
          p.id === entry.id && p.variants.some((v) => v.arch === activeArch)
      )
    )
  }, [loraStack, activeArch, loraPacks])

  const hasNegativePrompt = useMemo(
    () => Boolean(activeDetail?.capabilities?.negative && cfgValue > 1),
    [activeDetail, cfgValue]
  )

  const advancedControls = useMemo(
    () =>
      (activeDetail?.controls ?? []).filter(
        (c) =>
          (c.group === "advanced" || c.group === "core") &&
          c.id !== "prompt" &&
          c.id !== "negative" &&
          !(hasSizeControls && (c.id === "width" || c.id === "height"))
      ),
    [activeDetail, hasSizeControls]
  )

  const aspectMeta =
    ASPECT_RATIOS.find((a) => a.id === aspectId) ?? ASPECT_RATIOS[0]
  const resolvedSize = useMemo(
    () => sizeFromAspectAndSide(aspectId, sideLength),
    [aspectId, sideLength]
  )
  const sizeLabel = useMemo(() => {
    const width = Number(controlValues.width)
    const height = Number(controlValues.height)
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return `${width}×${height}`
    }
    return `${resolvedSize.width}×${resolvedSize.height}`
  }, [controlValues.width, controlValues.height, resolvedSize])

  /** Pixel size for the stage frame — live controls while streaming, else gallery recipe. */
  const stageDims = useMemo(() => {
    const fromPair = (wRaw: unknown, hRaw: unknown) => {
      const w = Number(wRaw)
      const h = Number(hRaw)
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        return { width: w, height: h }
      }
      return null
    }
    if (livePreviewSrc || pendingPreviewSrc) {
      return (
        fromPair(controlValues.width, controlValues.height) ?? {
          width: resolvedSize.width,
          height: resolvedSize.height,
        }
      )
    }
    if (previewItem) {
      const recipe = parseGalleryRecipe(previewItem)
      const fromRecipe = fromPair(recipe?.values.width, recipe?.values.height)
      if (fromRecipe) return fromRecipe
    }
    return (
      fromPair(controlValues.width, controlValues.height) ?? {
        width: resolvedSize.width,
        height: resolvedSize.height,
      }
    )
  }, [
    livePreviewSrc,
    pendingPreviewSrc,
    previewItem,
    controlValues.width,
    controlValues.height,
    resolvedSize,
  ])

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
    let unlistenLorasUpdated: (() => void) | undefined
    let unlistenLoraProgress: (() => void) | undefined

    /** Rolling window for download speed — longer span = smoother ETA. */
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

        const [gpuInfo, rts, status, bps, items, settings, loras] =
          await Promise.all([
            detectGpu(),
            listRuntimes(),
            comfyuiStatus(),
            listBlueprints(),
            listGallery(),
            listSettings(),
            listLoras(),
          ])
        preferredBlueprintIdRef.current =
          settings[SETTING_SELECTED_BLUEPRINT]?.trim() || null
        setGpu(gpuInfo)
        setRuntimes(rts)
        setBlueprints(bps)
        setBlueprintsLoaded(true)
        setLoraPacks(loras)
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
      } catch (e) {
        setSizesProbing(false)
        setBlueprintsLoaded(true)
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
      const now = performance.now()
      const bpId = installingIdRef.current
      // Blueprint installs: track the current file only (queue is per model).
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
        // Drop stale head if bytes went backwards (new file / resume reset).
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
            // Gentle blend on top of the windowed rate.
            emaSpeed =
              emaSpeed > 0 ? emaSpeed * 0.88 + windowSpeed * 0.12 : windowSpeed
          }
        }
      }

      if (bpId) {
        setInstallProgress((prev) => ({
          blueprintId: bpId,
          stage: prev?.stage ?? "download",
          message: prev?.message ?? "Downloading…",
          modelIndex: prev?.modelIndex ?? 0,
          modelTotal: prev?.modelTotal ?? 0,
          filename: prev?.filename,
          downloaded: p.downloaded,
          total: p.total,
          bytesPerSec: emaSpeed,
        }))
        return
      }

      // Runtime / other downloads (e.g. Comfy portable) — status line only.
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

    function finishInstallHistory(
      status: DownloadHistoryEntry["status"],
      message: string,
      blueprintId: string
    ) {
      const id = blueprintId || installingIdRef.current || ""
      const name =
        blueprintsRef.current.find((bp) => bp.id === id)?.name ||
        id ||
        "Blueprint"
      if (id) {
        setDownloadHistory((prev) =>
          [
            {
              blueprintId: id,
              name,
              status,
              message,
              at: Date.now(),
            },
            ...prev,
          ].slice(0, 12)
        )
        setPendingByBlueprint((prev) => {
          if (!(id in prev)) return prev
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    }

    void onBlueprintProgress((p) => {
      if (p.stage === "done") {
        finishInstallHistory("done", p.message, p.blueprintId)
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
        speedSamples = []
        emaSpeed = 0
        installByteOffsetRef.current = 0
        installByteTotalRef.current = null
        notifySuccess("Blueprint ready", p.message)
        pumpInstallQueueRef.current()
        return
      }
      if (p.stage === "error") {
        finishInstallHistory("error", p.message, p.blueprintId)
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
        speedSamples = []
        emaSpeed = 0
        installByteOffsetRef.current = 0
        installByteTotalRef.current = null
        notifyError(p.message, "Blueprint install failed")
        pumpInstallQueueRef.current()
        return
      }
      if (p.stage === "cancelled") {
        finishInstallHistory("cancelled", p.message, p.blueprintId)
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
        speedSamples = []
        emaSpeed = 0
        installByteOffsetRef.current = 0
        installByteTotalRef.current = null
        notifyDismiss("blueprint")
        pumpInstallQueueRef.current()
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

      // Drop finished/skipped models from the per-file queue.
      if (
        p.blueprintId &&
        p.filename &&
        (p.stage === "skip" || p.message.startsWith("Downloaded "))
      ) {
        const bpId = p.blueprintId
        const filename = p.filename
        setPendingByBlueprint((prev) => {
          const list = prev[bpId]
          if (!list?.some((m) => m.filename === filename)) return prev
          return {
            ...prev,
            [bpId]: list.filter((m) => m.filename !== filename),
          }
        })
      }

      setInstallProgress((prev) => {
        const filename = p.filename ?? prev?.filename ?? null
        const newFile =
          Boolean(p.filename) &&
          p.stage === "download" &&
          p.filename !== prev?.filename
        if (newFile) {
          speedSamples = []
          emaSpeed = 0
        }
        return {
          blueprintId: p.blueprintId || prev?.blueprintId || "",
          stage: p.stage,
          message: p.message,
          modelIndex: p.modelIndex,
          modelTotal: p.modelTotal,
          filename,
          // File bytes come from downloads://progress; reset when a new file starts.
          downloaded: newFile ? 0 : (prev?.downloaded ?? 0),
          total: newFile ? null : (prev?.total ?? null),
          bytesPerSec: newFile ? 0 : (prev?.bytesPerSec ?? 0),
        }
      })
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
      setStudioTab(category)
      // Select the new image on the stage; do not open the gallery rail.
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

    void onLoraProgress((p) => {
      const key = `lora:${p.loraId}:${p.arch}`
      if (p.stage === "queued") {
        setPendingByBlueprint((prev) => {
          if (prev[key]?.length) return prev
          return {
            ...prev,
            [key]: [
              {
                blueprintId: key,
                blueprintName: `${p.loraId} · ${p.arch}`,
                filename: p.filename || p.loraId,
                path: "loras",
              },
            ],
          }
        })
        return
      }
      if (p.stage === "download") {
        setLoraInstallingKey(`${p.loraId}:${p.arch}`)
        installingIdRef.current = key
        setInstallingId(key)
        setInstallProgress({
          blueprintId: key,
          stage: "download",
          message: p.message,
          modelIndex: 1,
          modelTotal: 1,
          filename: p.filename ?? null,
          downloaded: 0,
          total: null,
          bytesPerSec: 0,
        })
        return
      }
      if (
        p.stage === "done" ||
        p.stage === "error" ||
        p.stage === "cancelled"
      ) {
        setPendingByBlueprint((prev) => {
          if (!(key in prev)) return prev
          const next = { ...prev }
          delete next[key]
          return next
        })
        if (installingIdRef.current === key) {
          setLoraInstallingKey(null)
          installingIdRef.current = null
          setInstallingId(null)
          setInstallProgress(null)
        }
        if (p.stage === "error") {
          notifyError(p.message, "LoRA install failed")
        }
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
    }
  }, [desktop])

  // Creator unmounts the textarea; re-run when returning so height isn't stuck at rows={1}.
  // Measure with overflow hidden — overflow-y:auto during measure can add a scrollbar, wrap the
  // last line, and leave a blank row (common on near-full lines).
  useLayoutEffect(() => {
    if (studioTab === "creator" || studioTab === "downloads") return
    const el = promptRef.current
    if (!el) return
    const min = 44
    const max = 160
    el.style.overflowY = "hidden"
    el.style.height = "0px"
    const next = Math.min(Math.max(el.scrollHeight, min), max)
    el.style.height = `${next}px`
    el.style.overflowY = next >= max ? "auto" : "hidden"
  }, [prompt, studioTab])

  useEffect(() => {
    if (!activeSelectedId || !desktop) return
    let cancelled = false
    void getOfficialBlueprint(activeSelectedId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        const recipe = pendingRecipeRef.current
        pendingRecipeRef.current = null
        // Load this blueprint's defaults (don't keep prior blueprint advanced values).
        const next: Record<string, unknown> = {}
        for (const c of d.controls) {
          if (c.default !== undefined) {
            next[c.id] = c.default
          }
        }
        let values = recipe ? applyReuseAllSettings(next, recipe) : next
        if (recipe) {
          setLoraStack(lorasFromRecipe(recipe, loraPacksRef.current))
        }
        const hasW = d.controls.some((c) => c.id === "width")
        const hasH = d.controls.some((c) => c.id === "height")
        if (hasW && hasH) {
          if (recipe) {
            const width = Number(values.width)
            const height = Number(values.height)
            if (Number.isFinite(width) && Number.isFinite(height)) {
              const synced = syncSizeControls(width, height)
              setAspectId(synced.aspectId)
              setSideLength(synced.sideLength)
            }
          } else {
            // Keep the user's aspect / resolution across blueprint switches.
            const { width, height } = sizeFromAspectAndSide(
              aspectIdRef.current,
              sideLengthRef.current
            )
            values = { ...values, width, height }
          }
        }
        setControlValues(values)
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
        setCivitaiToken(s.civitai_api_key ?? "")
        setCivitaiTokenDirty(false)
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

  async function handleSaveCivitaiToken() {
    setCivitaiTokenSaving(true)
    try {
      await setSetting("civitai_api_key", civitaiToken.trim())
      setCivitaiTokenDirty(false)
      notifySuccess(
        "CivitAI API key saved",
        civitaiToken.trim()
          ? "CivitAI model downloads will use this key."
          : "API key cleared."
      )
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Settings")
    } finally {
      setCivitaiTokenSaving(false)
    }
  }

  async function loadPendingModels(id: string): Promise<DownloadModelItem[]> {
    const detail = await getBlueprint(id)
    const blueprintName =
      detail.name || blueprintsRef.current.find((b) => b.id === id)?.name || id
    return (detail.models ?? [])
      .filter((m) => m.url.trim() !== "" && !m.ready)
      .map((m) => ({
        blueprintId: id,
        blueprintName,
        filename: m.filename,
        path: m.path,
        role: m.role,
      }))
  }

  function rememberPendingModels(id: string) {
    void loadPendingModels(id)
      .then((models) => {
        setPendingByBlueprint((prev) => ({ ...prev, [id]: models }))
      })
      .catch((e) => {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Could not list models"
        )
      })
  }

  function enqueueBlueprintInstall(id: string) {
    if (installingIdRef.current === id) return
    if (installQueueRef.current.includes(id)) return
    const next = [...installQueueRef.current, id]
    installQueueRef.current = next
    setInstallQueue(next)
    rememberPendingModels(id)
  }

  function removeQueuedInstall(id: string) {
    const next = installQueueRef.current.filter((item) => item !== id)
    installQueueRef.current = next
    setInstallQueue(next)
    setPendingByBlueprint((prev) => {
      if (!(id in prev)) return prev
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  async function startBlueprintInstall(id: string) {
    installingIdRef.current = id
    setInstallingId(id)
    const bp = blueprintsRef.current.find((b) => b.id === id)
    installByteOffsetRef.current = 0
    installByteTotalRef.current = bp?.totalSizeBytes ?? null
    try {
      const models = await loadPendingModels(id)
      setPendingByBlueprint((prev) => ({ ...prev, [id]: models }))
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not list models"
      )
    }
    setInstallProgress({
      blueprintId: id,
      stage: "start",
      message: "Starting model download…",
      modelIndex: 0,
      modelTotal: bp?.modelCount ?? 0,
      filename: null,
      downloaded: 0,
      total: null,
      bytesPerSec: 0,
    })
    notifyDismiss("download")
    notifyDismiss("blueprint")
    try {
      await installOfficialBlueprint(id)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      installingIdRef.current = null
      setInstallingId(null)
      setInstallProgress(null)
      installByteOffsetRef.current = 0
      installByteTotalRef.current = null
      // Backend still one-at-a-time — queue instead of surfacing a confusing error.
      if (message.startsWith("Already installing blueprint:")) {
        enqueueBlueprintInstall(id)
        return
      }
      setPendingByBlueprint((prev) => {
        if (!(id in prev)) return prev
        const copy = { ...prev }
        delete copy[id]
        return copy
      })
      const name = blueprintsRef.current.find((b) => b.id === id)?.name || id
      setDownloadHistory((prev) =>
        [
          {
            blueprintId: id,
            name,
            status: "error" as const,
            message,
            at: Date.now(),
          },
          ...prev,
        ].slice(0, 12)
      )
      notifyError(message, "Blueprint install failed")
      pumpInstallQueueRef.current()
    }
  }

  useEffect(() => {
    blueprintsRef.current = blueprints
  }, [blueprints])

  useEffect(() => {
    loraPacksRef.current = loraPacks
  }, [loraPacks])

  useEffect(() => {
    aspectIdRef.current = aspectId
  }, [aspectId])

  useEffect(() => {
    sideLengthRef.current = sideLength
  }, [sideLength])

  useEffect(() => {
    pumpInstallQueueRef.current = () => {
      if (installingIdRef.current) return
      const next = installQueueRef.current[0]
      if (!next) return
      const rest = installQueueRef.current.slice(1)
      installQueueRef.current = rest
      setInstallQueue(rest)
      void startBlueprintInstall(next)
    }
  })

  async function ensureInstallTokens(id: string): Promise<boolean> {
    const bp = blueprints.find((b) => b.id === id)
    try {
      const settings = await listSettings()
      if (bp?.requiresHfToken) {
        const token = (settings.huggingface_token ?? "").trim()
        if (!token) {
          setPendingInstallId(id)
          setHfTokenDialogOpen(true)
          return false
        }
      }
      if (bp?.requiresCivitaiToken) {
        const token = (settings.civitai_api_key ?? "").trim()
        if (!token) {
          setPendingInstallId(id)
          setCivitaiTokenDialogOpen(true)
          return false
        }
      }
      return true
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Settings")
      return false
    }
  }

  async function requestBlueprintInstall(id: string) {
    if (installingIdRef.current === id) return
    if (installQueueRef.current.includes(id)) return
    if (installingIdRef.current) {
      enqueueBlueprintInstall(id)
      return
    }
    await startBlueprintInstall(id)
  }

  const { activeModel, queuedModels } = useMemo(() => {
    const queued: DownloadModelItem[] = []
    let active: DownloadModelItem | null = null
    const installing = installingId

    if (installing) {
      const pending = pendingByBlueprint[installing] ?? []
      const currentName = installProgress?.filename ?? null
      if (currentName) {
        const idx = pending.findIndex((m) => m.filename === currentName)
        if (idx >= 0) {
          active = pending[idx]!
          queued.push(...pending.slice(idx + 1))
        } else {
          // File started before pending list refreshed, or already dropped.
          const bpName =
            blueprints.find((b) => b.id === installing)?.name || installing
          if (
            installProgress?.stage === "download" ||
            installProgress?.stage === "start" ||
            installProgress?.stage === "deps"
          ) {
            active = {
              blueprintId: installing,
              blueprintName: bpName,
              filename: currentName,
              path: "",
            }
          }
          queued.push(...pending)
        }
      } else if (pending.length > 0) {
        active = pending[0]!
        queued.push(...pending.slice(1))
      }
    }

    for (const id of installQueue) {
      queued.push(...(pendingByBlueprint[id] ?? []))
    }

    return { activeModel: active, queuedModels: queued }
  }, [
    installingId,
    installQueue,
    pendingByBlueprint,
    installProgress?.filename,
    installProgress?.stage,
    blueprints,
  ])

  async function handleInstallBlueprint(id: string) {
    if (!(await ensureInstallTokens(id))) return
    await requestBlueprintInstall(id)
  }

  function trackLoraInstall(
    id: string,
    arch: string,
    filename: string,
    active: boolean
  ) {
    const pack = loraPacks.find((p) => p.id === id)
    const key = `lora:${id}:${arch}`
    const item = {
      blueprintId: key,
      blueprintName: `${pack?.name ?? id} · ${arch}`,
      filename,
      path: "loras",
    }
    setPendingByBlueprint((prev) => ({
      ...prev,
      [key]: [item],
    }))
    if (active) {
      setLoraInstallingKey(`${id}:${arch}`)
      installingIdRef.current = key
      setInstallingId(key)
      setInstallProgress({
        blueprintId: key,
        stage: "download",
        message: `Downloading ${filename}`,
        modelIndex: 1,
        modelTotal: 1,
        filename,
        downloaded: 0,
        total: null,
        bytesPerSec: 0,
      })
    }
  }

  async function beginLoraInstall(id: string, arch: string) {
    const pack = loraPacks.find((p) => p.id === id)
    const filename = pack?.variants.find((v) => v.arch === arch)?.filename ?? id
    const alreadyActive = loraInstallingKey != null
    trackLoraInstall(id, arch, filename, !alreadyActive)
    try {
      await installLoraVariant(id, arch)
    } catch (e) {
      const key = `lora:${id}:${arch}`
      setPendingByBlueprint((prev) => {
        if (!(key in prev)) return prev
        const next = { ...prev }
        delete next[key]
        return next
      })
      if (installingIdRef.current === key) {
        setLoraInstallingKey(null)
        installingIdRef.current = null
        setInstallingId(null)
        setInstallProgress(null)
      }
      notifyError(e instanceof Error ? e.message : String(e), "LoRA install")
    }
  }

  async function handleHfTokenDialogConfirm(token: string) {
    const id = pendingInstallId
    await setSetting("huggingface_token", token)
    setHfToken(token)
    setHfTokenDirty(false)
    setHfTokenDialogOpen(false)
    notifySuccess("Hugging Face token saved", "Continuing…")
    if (id) {
      if (!(await ensureInstallTokens(id))) return
      setPendingInstallId(null)
      await requestBlueprintInstall(id)
    } else {
      setPendingInstallId(null)
    }
  }

  async function handleCivitaiTokenDialogConfirm(token: string) {
    const id = pendingInstallId
    await setSetting("civitai_api_key", token)
    setCivitaiToken(token)
    setCivitaiTokenDirty(false)
    setCivitaiTokenDialogOpen(false)
    setPendingInstallId(null)
    notifySuccess("CivitAI API key saved", "Continuing model download…")
    if (id) await requestBlueprintInstall(id)
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
    setRuntimeMessage("Starting runtime…")
    notifyProgress("runtime", "Starting runtime")
    try {
      await startComfyui()
    } catch (e) {
      setRuntimeBusy(false)
      setComfyHealthy(false)
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Failed to start runtime"
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

  function applySize(nextAspectId: string, nextSideLength: number) {
    const { width, height } = sizeFromAspectAndSide(
      nextAspectId,
      nextSideLength
    )
    setAspectId(nextAspectId)
    setSideLength(nextSideLength)
    setControlValues((prev) => ({
      ...prev,
      width,
      height,
    }))
  }

  function selectBlueprint(id: string) {
    setSelectedId(id)
    preferredBlueprintIdRef.current = id
    void setSetting(SETTING_SELECTED_BLUEPRINT, id).catch(() => {})
  }

  async function handleGenerate() {
    if (!blueprintsLoaded) {
      notifyInfo(
        "Loading blueprints",
        "Almost ready — try Generate again in a moment.",
        "generate"
      )
      return
    }
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
      if (supportsLoras && activeLoraStack.length > 0) {
        values.loras = activeLoraStack
      } else {
        delete values.loras
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

  function handleReuseGalleryPrompt(item: GalleryItem) {
    const recipe = parseGalleryRecipe(item)
    if (!recipe?.prompt) {
      notifyInfo("No prompt", "This image has no reusable prompt.", "reuse")
      return
    }
    setSelectedGalleryId(item.id)
    setPrompt(recipe.prompt)
    notifySuccess("Prompt loaded", "From gallery image")
  }

  function handleReuseGallerySettings(item: GalleryItem) {
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
      const synced = syncSizeControls(width, height)
      setAspectId(synced.aspectId)
      setSideLength(synced.sideLength)
    }

    if (recipe.blueprintId) {
      if (
        recipe.blueprintId === activeSelectedId &&
        activeDetail?.id === recipe.blueprintId
      ) {
        const defaults: Record<string, unknown> = {}
        for (const c of activeDetail.controls) {
          if (c.default !== undefined) defaults[c.id] = c.default
        }
        setControlValues(applyReuseAllSettings(defaults, recipe))
        setLoraStack(lorasFromRecipe(recipe, loraPacks))
      } else {
        pendingRecipeRef.current = recipe
        selectBlueprint(recipe.blueprintId)
      }
    } else {
      setControlValues((prev) => applyReuseAllSettings(prev, recipe))
      setLoraStack(lorasFromRecipe(recipe, loraPacks))
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
  const showDownloads = studioTab === "downloads"
  const showGalleryRail = !showCreator && !showDownloads
  const showAdvancedRail = showGalleryRail && canGenerate
  const stageInsetLeft =
    showAdvancedRail && advancedOpen ? SIDE_RAIL_WIDTH : undefined
  const stageInsetRight =
    showGalleryRail && galleryOpen ? SIDE_RAIL_WIDTH : undefined

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-3">
        <header className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-card/90 px-2 py-1 shadow-lg shadow-black/30 backdrop-blur-md sm:gap-3 sm:px-3">
          <div className="flex shrink-0 items-center gap-2 pl-1 text-sm font-medium">
            <LayersIcon className="size-4 text-primary" />
            <span className="hidden sm:inline">Open Gen AI</span>
          </div>
          <nav className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto text-sm [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {STUDIO_TABS.map((tab) => {
              const active = studioTab === tab.id
              const downloading =
                tab.id === "downloads" &&
                (installingId != null || installQueue.length > 0)
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudioTab(tab.id)}
                  className={cn(
                    "relative shrink-0 px-2.5 py-1.5 transition-colors sm:px-3",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tab.label}
                    {downloading ? (
                      <span
                        className="size-1.5 rounded-full bg-primary"
                        aria-label="Download in progress"
                      />
                    ) : null}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-primary sm:inset-x-3" />
                  ) : null}
                </button>
              )
            })}
          </nav>
          <WithTooltip label="Settings">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0 rounded-full"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon />
            </Button>
          </WithTooltip>
        </header>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className="absolute inset-0 flex flex-col pt-14 transition-[left,right] duration-300 ease-out"
          style={{
            left: stageInsetLeft,
            right: stageInsetRight,
          }}
        >
          {showCreator ? (
            <CreatorPanel
              editBlueprintId={editBlueprintId}
              onEditCleared={() => setEditBlueprintId(null)}
              onBlueprintsChanged={() => {
                void listBlueprints()
                  .then(setBlueprints)
                  .catch((e) =>
                    notifyError(e instanceof Error ? e.message : String(e))
                  )
              }}
            />
          ) : showDownloads ? (
            <DownloadsPanel
              activeModel={activeModel}
              queuedModels={queuedModels}
              progress={installProgress}
              history={downloadHistory}
              onCancel={() => {
                void cancelBlueprintInstall().catch((e) =>
                  notifyError(
                    e instanceof Error ? e.message : String(e),
                    "Could not cancel"
                  )
                )
              }}
              onRemoveBlueprint={removeQueuedInstall}
              onOpenBlueprints={() => setPickerOpen(true)}
            />
          ) : (
            <>
              <main className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-4 md:px-10">
                {livePreviewSrc || pendingPreviewSrc ? (
                  <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
                    {livePreviewSrc ? (
                      <StageImage
                        src={livePreviewSrc}
                        width={stageDims.width}
                        height={stageDims.height}
                      />
                    ) : null}
                    {pendingPreviewSrc ? (
                      <StageImage
                        key={pendingPreviewSrc}
                        src={pendingPreviewSrc}
                        width={stageDims.width}
                        height={stageDims.height}
                        overlay
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
                  <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
                    <StageImage
                      src={gallerySrc(previewItem.path)}
                      width={stageDims.width}
                      height={stageDims.height}
                    />
                  </div>
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
                <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl backdrop-blur-xl">
                  <div className="bg-background/50 px-4 pt-3.5 pb-3 md:px-5">
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
                        "min-h-11 w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60",
                        // Scroll only when height-capped (set in layout effect).
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
                      <Popover>
                        <PopoverTrigger
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
                          <span className="tabular-nums">
                            {aspectMeta.label}
                            <span className="text-muted-foreground">
                              {" "}
                              · {sizeLabel}
                            </span>
                          </span>
                          <ChevronDownIcon className="size-3.5 opacity-60" />
                        </PopoverTrigger>
                        <PopoverPopup
                          align="start"
                          side="top"
                          sideOffset={8}
                          className="w-[20.5rem]"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex items-end justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-xl leading-none font-medium tracking-tight tabular-nums">
                                  {sizeLabel}
                                </p>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">
                                  {aspectMeta.name}
                                </p>
                              </div>
                              <div
                                className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/40"
                                aria-hidden
                              >
                                <span
                                  className="rounded-[2px] border border-primary bg-primary/15"
                                  style={aspectFrameStyle(aspectMeta)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-1.5">
                              {ASPECT_RATIOS.map((aspect) => {
                                const selected = aspect.id === aspectId
                                return (
                                  <WithTooltip
                                    key={aspect.id}
                                    label={aspect.name}
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        applySize(aspect.id, sideLength)
                                      }
                                      className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 transition-colors",
                                        selected
                                          ? "border-primary/50 bg-primary/10 text-foreground"
                                          : "border-transparent bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
                                      )}
                                    >
                                      <span className="flex h-4 items-center justify-center">
                                        <span
                                          className={cn(
                                            "rounded-[1.5px] border",
                                            selected
                                              ? "border-primary bg-primary/20"
                                              : "border-current/50 bg-transparent"
                                          )}
                                          style={aspectFrameStyle(aspect)}
                                        />
                                      </span>
                                      <span className="text-[10px] font-medium tracking-tight">
                                        {aspect.label}
                                      </span>
                                    </button>
                                  </WithTooltip>
                                )
                              })}
                            </div>

                            <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  Size
                                </span>
                                <span className="font-mono text-xs text-foreground tabular-nums">
                                  {sideLength}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {SIDE_LENGTH_PRESETS.map((preset) => {
                                  const selected = sideLength === preset
                                  return (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() =>
                                        applySize(aspectId, preset)
                                      }
                                      className={cn(
                                        "rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors",
                                        selected
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-muted/45 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                      )}
                                    >
                                      {preset}
                                    </button>
                                  )
                                })}
                              </div>
                              <Slider
                                min={SIDE_LENGTH_MIN}
                                max={SIDE_LENGTH_MAX}
                                step={SIDE_LENGTH_STEP}
                                value={[sideLength]}
                                onValueChange={(value) => {
                                  const next = Array.isArray(value)
                                    ? value[0]
                                    : value
                                  if (typeof next === "number") {
                                    applySize(aspectId, next)
                                  }
                                }}
                              />
                            </div>
                          </div>
                        </PopoverPopup>
                      </Popover>
                    ) : null}

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
                </div>
              </div>
            </>
          )}
        </div>

        {showAdvancedRail ? (
          <>
            <SideRailHandle
              side="left"
              open={advancedOpen}
              offset={SIDE_RAIL_WIDTH}
              count={activeLoraStack.length}
              icon={<SlidersHorizontalIcon className="size-3.5 opacity-90" />}
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-label={advancedOpen ? "Close advanced" : "Open advanced"}
              tooltip={advancedOpen ? "Close advanced" : "Open advanced"}
            >
              {advancedOpen ? (
                <ChevronLeftIcon className="size-4 opacity-70" />
              ) : (
                <ChevronRightIcon className="size-4 opacity-70" />
              )}
            </SideRailHandle>

            <AdvancedPanel open={advancedOpen}>
              {(() => {
                const seedControl = advancedControls.find(
                  (c) => c.id === "seed"
                )
                const stepsControl = advancedControls.find(
                  (c) => c.id === "steps"
                )
                const cfgControl = advancedControls.find(
                  (c) => c.id === "cfg" || c.id === "cfg_scale"
                )
                const otherControls = advancedControls.filter(
                  (c) =>
                    c.id !== "seed" &&
                    c.id !== "steps" &&
                    c.id !== "cfg" &&
                    c.id !== "cfg_scale"
                )
                const latestGallerySeed = (() => {
                  const recipe = tabGallery[0]
                    ? parseGalleryRecipe(tabGallery[0])
                    : null
                  const seed = Number(recipe?.values.seed)
                  return Number.isFinite(seed) ? seed : null
                })()

                function renderNumberControl(
                  control: (typeof advancedControls)[number],
                  opts?: { stretch?: boolean; isSeed?: boolean }
                ) {
                  const value = Number(
                    controlValues[control.id] ?? control.default ?? 0
                  )
                  const isSeed = opts?.isSeed ?? control.id === "seed"
                  return (
                    <label
                      key={control.id}
                      className={cn(
                        "flex flex-col gap-1",
                        opts?.stretch
                          ? "w-full"
                          : "min-w-[calc(50%-0.25rem)] flex-1"
                      )}
                    >
                      <span className="text-[10px] text-muted-foreground">
                        {isSeed
                          ? "Seed (0 = random)"
                          : control.label || control.id}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isSeed ? (
                          <WithTooltip label="Set to 0 (random each generate)">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              className="size-8 shrink-0"
                              aria-label="Random seed"
                              onClick={() =>
                                setControlValues((prev) => ({
                                  ...prev,
                                  seed: 0,
                                }))
                              }
                            >
                              <DicesIcon className="size-3.5" />
                            </Button>
                          </WithTooltip>
                        ) : null}
                        <NumberField
                          size="sm"
                          className="min-w-0 flex-1 gap-0"
                          value={Number.isFinite(value) ? value : 0}
                          format={isSeed ? { useGrouping: false } : undefined}
                          onValueChange={(v) =>
                            setControlValues((prev) => ({
                              ...prev,
                              [control.id]: v ?? 0,
                            }))
                          }
                        >
                          <NumberFieldGroup className="h-8">
                            <NumberFieldInput
                              className={cn(
                                "h-full! font-mono text-sm leading-none! font-medium tabular-nums sm:h-full!",
                                "text-center!"
                              )}
                            />
                          </NumberFieldGroup>
                        </NumberField>
                        {isSeed ? (
                          <WithTooltip label="Use seed from last gallery image">
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="outline"
                              className="size-8 shrink-0"
                              aria-label="Use seed from last gallery image"
                              disabled={latestGallerySeed == null}
                              onClick={() => {
                                if (latestGallerySeed == null) {
                                  notifyInfo(
                                    "No seed",
                                    "Generate an image first.",
                                    "seed"
                                  )
                                  return
                                }
                                setControlValues((prev) => ({
                                  ...prev,
                                  seed: latestGallerySeed,
                                }))
                                notifySuccess(
                                  "Seed loaded",
                                  String(latestGallerySeed)
                                )
                              }}
                            >
                              <HistoryIcon className="size-3.5" />
                            </Button>
                          </WithTooltip>
                        ) : null}
                      </div>
                    </label>
                  )
                }

                function renderSliderControl(
                  control: (typeof advancedControls)[number],
                  opts: { min: number; max: number; step: number }
                ) {
                  const raw = Number(
                    controlValues[control.id] ?? control.default ?? opts.min
                  )
                  const value = Number.isFinite(raw)
                    ? Math.min(opts.max, Math.max(opts.min, raw))
                    : opts.min
                  const label = control.label || control.id
                  const display =
                    opts.step < 1
                      ? String(Number(value.toFixed(1)))
                      : String(Math.round(value))
                  return (
                    <div
                      key={control.id}
                      className="flex w-full flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {label}
                        </span>
                        <span className="font-mono text-xs text-foreground tabular-nums">
                          {display}
                        </span>
                      </div>
                      <Slider
                        className="w-full min-w-0 [&_[data-slot=slider-control]]:min-h-4 [&_[data-slot=slider-control]]:min-w-0! [&_[data-slot=slider-control]]:items-center"
                        aria-label={label}
                        min={opts.min}
                        max={opts.max}
                        step={opts.step}
                        value={[value]}
                        onValueChange={(nextValue) => {
                          const next = Array.isArray(nextValue)
                            ? nextValue[0]
                            : nextValue
                          if (typeof next !== "number") return
                          setControlValues((prev) => ({
                            ...prev,
                            [control.id]: next,
                          }))
                        }}
                      />
                    </div>
                  )
                }

                return (
                  <>
                    {seedControl || stepsControl || cfgControl ? (
                      <Frame className="w-full bg-accent/70">
                        <FrameHeader className="px-3 py-2.5">
                          <FrameTitle>Sampling</FrameTitle>
                        </FrameHeader>
                        <FramePanel className="bg-card p-3">
                          <div className="flex flex-col gap-3">
                            {seedControl
                              ? renderNumberControl(seedControl, {
                                  stretch: true,
                                  isSeed: true,
                                })
                              : null}
                            {stepsControl
                              ? renderSliderControl(stepsControl, {
                                  min: 1,
                                  max: 50,
                                  step: 1,
                                })
                              : null}
                            {cfgControl
                              ? renderSliderControl(cfgControl, {
                                  min: 1,
                                  max: 20,
                                  step: 0.5,
                                })
                              : null}
                          </div>
                        </FramePanel>
                      </Frame>
                    ) : null}

                    {otherControls.length > 0 ? (
                      <Frame className="w-full bg-accent/70">
                        <FrameHeader className="px-3 py-2.5">
                          <FrameTitle>More</FrameTitle>
                        </FrameHeader>
                        <FramePanel className="bg-card p-3">
                          <div className="flex flex-wrap gap-2">
                            {otherControls.map((control) => {
                              if (
                                control.type === "number" ||
                                control.type === "slider"
                              ) {
                                return renderNumberControl(control)
                              }
                              return (
                                <label
                                  key={control.id}
                                  className="flex w-full flex-col gap-1"
                                >
                                  <span className="text-[10px] text-muted-foreground">
                                    {control.label || control.id}
                                  </span>
                                  <input
                                    className="h-8 w-full rounded-lg border border-input bg-input/32 px-2.5 font-mono text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
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
                            })}
                          </div>
                        </FramePanel>
                      </Frame>
                    ) : null}

                    {supportsLoras && activeArch ? (
                      <LoraStack
                        arch={activeArch}
                        packs={loraPacks}
                        stack={activeLoraStack}
                        onChange={setLoraStack}
                        installingKey={loraInstallingKey}
                        disabled={generating}
                        onOpenLibrary={() => setLoraPickerOpen(true)}
                        onInstallVariant={(id, arch) => {
                          void beginLoraInstall(id, arch)
                        }}
                      />
                    ) : null}

                    {advancedControls.length === 0 && !supportsLoras ? (
                      <p className="text-xs text-muted-foreground">
                        No advanced controls for this blueprint.
                      </p>
                    ) : null}

                    {selected && !isInstalled(selected) ? (
                      <p className="text-xs text-warning-foreground">
                        Models not installed yet. Open the blueprint picker to
                        download.
                      </p>
                    ) : null}
                  </>
                )
              })()}
            </AdvancedPanel>
          </>
        ) : null}

        {showGalleryRail ? (
          <>
            <SideRailHandle
              side="right"
              open={galleryOpen}
              offset={SIDE_RAIL_WIDTH}
              count={tabGallery.length}
              icon={<ImagesIcon className="size-3.5 opacity-90" />}
              onClick={() => setGalleryOpen((open) => !open)}
              aria-label={galleryOpen ? "Close gallery" : "Open gallery"}
              tooltip={galleryOpen ? "Close gallery" : "Open gallery"}
            >
              {galleryOpen ? (
                <ChevronRightIcon className="size-4 opacity-70" />
              ) : (
                <ChevronLeftIcon className="size-4 opacity-70" />
              )}
            </SideRailHandle>

            <GalleryPanel
              open={galleryOpen}
              title={`${studioLabel} Gallery`}
              items={tabGallery}
              selectedId={selectedGalleryId}
              onSelect={setSelectedGalleryId}
              onDelete={handleDeleteGalleryItem}
              onReusePrompt={handleReuseGalleryPrompt}
              onReuseSettings={handleReuseGallerySettings}
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
        queuedIds={installQueue}
        sizesProbing={sizesProbing}
        onSelect={selectBlueprint}
        onInstall={(id) => void handleInstallBlueprint(id)}
        onEdit={(id) => {
          setEditBlueprintId(id)
          setStudioTab("creator")
        }}
      />

      <LoraPickerDialog
        open={loraPickerOpen}
        onOpenChange={setLoraPickerOpen}
        packs={loraPacks}
        arch={activeArch}
        selectedIds={activeLoraStack.map((s) => s.id)}
        installingKey={loraInstallingKey}
        onSelect={(id) => {
          const pack = loraPacks.find((p) => p.id === id)
          if (!pack) return
          setLoraStack((prev) => {
            if (prev.some((s) => s.id === id)) return prev
            return [...prev, { id, strength: pack.defaultStrength }]
          })
        }}
        onInstall={(id, arch) => {
          void beginLoraInstall(id, arch)
        }}
        onDeleteUser={(id) => {
          void deleteUserLora(id)
            .then(() => {
              setLoraStack((prev) => prev.filter((s) => s.id !== id))
              notifySuccess("LoRA removed")
              return listLoras().then(setLoraPacks)
            })
            .catch((e) =>
              notifyError(e instanceof Error ? e.message : String(e))
            )
        }}
      />

      <ModelsLibraryDialog
        open={modelsOpen}
        onOpenChange={setModelsOpen}
        preferArch={activeDetail?.arch ?? null}
        onLoraInstallStarted={(id, arch, filename) => {
          trackLoraInstall(id, arch, filename, loraInstallingKey == null)
        }}
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
          if (!open && !civitaiTokenDialogOpen) setPendingInstallId(null)
        }}
        blueprintName={
          pendingInstallId
            ? (blueprints.find((b) => b.id === pendingInstallId)?.name ?? null)
            : null
        }
        onConfirm={handleHfTokenDialogConfirm}
      />

      <CivitaiTokenDialog
        key={
          civitaiTokenDialogOpen
            ? (pendingInstallId ?? "civitai-token")
            : "civitai-token-closed"
        }
        open={civitaiTokenDialogOpen}
        onOpenChange={(open) => {
          setCivitaiTokenDialogOpen(open)
          if (!open) setPendingInstallId(null)
        }}
        blueprintName={
          pendingInstallId
            ? (blueprints.find((b) => b.id === pendingInstallId)?.name ?? null)
            : null
        }
        onConfirm={handleCivitaiTokenDialogConfirm}
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
              <p className="font-medium">Models</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Shared weights library used by every blueprint.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => setModelsOpen(true)}
              >
                <HardDriveIcon />
                Browse models
              </Button>
            </div>
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

            <div className="rounded-xl border p-4">
              <p className="font-medium">CivitAI</p>
              <p className="mt-1 text-xs text-muted-foreground">
                API key for model downloads. On your account page, scroll to{" "}
                <span className="font-medium text-foreground">API Keys</span>,
                create a key, then paste it here.
              </p>
              <label className="mt-3 flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">API key</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste API key…"
                  value={civitaiToken}
                  onChange={(e) => {
                    setCivitaiToken(e.target.value)
                    setCivitaiTokenDirty(true)
                  }}
                  className="font-mono text-xs"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={civitaiTokenSaving || !civitaiTokenDirty}
                  onClick={() => void handleSaveCivitaiToken()}
                >
                  {civitaiTokenSaving ? "Saving…" : "Save key"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    void openExternalUrl(
                      "https://civitai.com/user/account"
                    ).catch((e) =>
                      notifyError(
                        e instanceof Error ? e.message : String(e),
                        "Could not open browser"
                      )
                    )
                  }}
                >
                  Open account settings
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
