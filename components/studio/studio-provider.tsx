"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { SIDE_RAIL_WIDTH } from "@/components/side-rail"
import { STUDIO_TABS, tabFromPath } from "@/components/studio/studio-tabs"
import {
  cancelDownload,
  cancelJob,
  comfyuiStatus,
  deleteGalleryItem,
  detectGpu,
  ensureDownload,
  galleryItemCategory,
  gallerySrc,
  generateImage,
  getOfficialBlueprint,
  deleteUserLora,
  isTauri,
  listDownloads,
  listGallery,
  listBlueprints,
  listLoras,
  listRuntimes,
  listSettings,
  listUpscalers,
  onDownloadManager,
  pauseDownload,
  resumeDownload,
  setSetting,
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
  onDownloadProgress,
  onLoraProgress,
  onLorasUpdated,
  onPromptToolsProgress,
  onUpscaleProgress,
  onUpscalersUpdated,
  onGalleryDeleted,
  onGalleryUpdated,
  onJobProgress,
  onJobsUpdated,
  onRuntimeProgress,
  onRuntimesUpdated,
  parseGalleryRecipe,
  startComfyui,
  stopComfyui,
  usduNodeReady,
  type BlueprintDetail,
  type DownloadSnapshot,
  type GalleryItem,
  type GalleryRecipe,
  type LoraPack,
  type LoraStackEntry,
  type UpscaleModelInfo,
  type GpuInfo,
  type Blueprint,
  type RuntimeInstall,
  type StudioTab,
  type ToolsHandoff,
} from "@/lib/host"
import {
  applyReuseAllSettings,
  isInstalled,
  lorasFromRecipe,
  pickDefaultBlueprintId,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import { formatBytes, formatDuration } from "@/lib/format"
import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "@/lib/notify"
import {
  SIDE_LENGTH_DEFAULT,
  sizeFromAspectAndSide,
  syncSizeControls,
} from "@/lib/image-size"

const DEFAULT_UPSCALE_MODEL_ID = "4x-ultrasharp"

const EMPTY_DOWNLOAD_SNAPSHOT: DownloadSnapshot = {
  active: null,
  queued: [],
  history: [],
}

function blueprintIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("blueprint:")
    ? jobKey.slice("blueprint:".length)
    : null
}

function loraKeyFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("lora:") ? jobKey.slice("lora:".length) : null
}

function upscaleIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("upscale:") ? jobKey.slice("upscale:".length) : null
}

export { STUDIO_TABS, tabFromPath } from "@/components/studio/studio-tabs"

const SETTING_SELECTED_BLUEPRINT = "selected_blueprint_id"

const subscribeNoop = () => () => {}

export type StudioContextValue = {
  desktop: boolean
  studioTab: StudioTab
  navigateTab: (tab: StudioTab) => void
  blueprints: Blueprint[]
  setBlueprints: Dispatch<SetStateAction<Blueprint[]>>
  blueprintsLoaded: boolean
  selectedId: string | null
  selectBlueprint: (id: string) => void
  pickerOpen: boolean
  setPickerOpen: Dispatch<SetStateAction<boolean>>
  editBlueprintId: string | null
  setEditBlueprintId: Dispatch<SetStateAction<string | null>>
  settingsOpen: boolean
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  modelsOpen: boolean
  setModelsOpen: Dispatch<SetStateAction<boolean>>
  loraPickerOpen: boolean
  setLoraPickerOpen: Dispatch<SetStateAction<boolean>>
  loraPacks: LoraPack[]
  setLoraPacks: Dispatch<SetStateAction<LoraPack[]>>
  loraStack: LoraStackEntry[]
  setLoraStack: Dispatch<SetStateAction<LoraStackEntry[]>>
  loraInstallingKey: string | null
  beginLoraInstall: (id: string, arch: string) => Promise<void>
  upscaleEnabled: boolean
  setUpscaleEnabled: Dispatch<SetStateAction<boolean>>
  upscaleModelId: string
  setUpscaleModelId: Dispatch<SetStateAction<string>>
  usduEnabled: boolean
  setUsduEnabled: Dispatch<SetStateAction<boolean>>
  usduScale: 2 | 4
  setUsduScale: Dispatch<SetStateAction<2 | 4>>
  usduSteps: number
  setUsduSteps: Dispatch<SetStateAction<number>>
  usduDenoise: number
  setUsduDenoise: Dispatch<SetStateAction<number>>
  upscaleModels: UpscaleModelInfo[]
  usduReady: boolean
  upscaleInstallingId: string | null
  beginUpscaleInstall: (id: string) => Promise<void>
  beginUsduInstall: () => Promise<void>
  beginPromptToolsInstall: () => Promise<void>
  downloadSnapshot: DownloadSnapshot
  pauseDownload: (jobId: string) => Promise<void>
  resumeDownload: (jobId: string) => Promise<void>
  cancelDownload: (jobId: string) => Promise<void>
  hfToken: string
  setHfToken: Dispatch<SetStateAction<string>>
  hfTokenDirty: boolean
  setHfTokenDirty: Dispatch<SetStateAction<boolean>>
  hfTokenSaving: boolean
  hfTokenDialogOpen: boolean
  setHfTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  civitaiToken: string
  setCivitaiToken: Dispatch<SetStateAction<string>>
  civitaiTokenDirty: boolean
  setCivitaiTokenDirty: Dispatch<SetStateAction<boolean>>
  civitaiTokenSaving: boolean
  civitaiTokenDialogOpen: boolean
  setCivitaiTokenDialogOpen: Dispatch<SetStateAction<boolean>>
  pendingInstallId: string | null
  setPendingInstallId: Dispatch<SetStateAction<string | null>>
  galleryOpen: boolean
  setGalleryOpen: Dispatch<SetStateAction<boolean>>
  advancedOpen: boolean
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>
  prompt: string
  setPrompt: Dispatch<SetStateAction<string>>
  aspectId: string
  sideLength: number
  applySize: (nextAspectId: string, nextSideLength: number) => void
  runtimes: RuntimeInstall[]
  gpu: GpuInfo | null
  runtimeBusy: boolean
  runtimeMessage: string | null
  comfyHealthy: boolean
  comfy: RuntimeInstall | undefined
  installingId: string | null
  installQueue: string[]
  sizesProbing: boolean
  detail: BlueprintDetail | null
  activeDetail: BlueprintDetail | null
  controlValues: Record<string, unknown>
  setControlValues: Dispatch<SetStateAction<Record<string, unknown>>>
  generating: boolean
  activeJobId: string | null
  livePreviewSrc: string | null
  pendingPreviewSrc: string | null
  clearLivePreview: () => void
  queueLivePreview: (path: string) => void
  promotePendingPreview: (loaded: string) => void
  genStep: { step: number; max: number } | null
  gallery: GalleryItem[]
  selectedGalleryId: string | null
  setSelectedGalleryId: Dispatch<SetStateAction<string | null>>
  tabBlueprints: Blueprint[]
  tabGallery: GalleryItem[]
  activeSelectedId: string | null
  selected: Blueprint | null
  previewItem: GalleryItem | null
  activeLoraStack: LoraStackEntry[]
  hasSizeControls: boolean
  hasNegativePrompt: boolean
  advancedControls: NonNullable<BlueprintDetail["controls"]>
  latestGallerySeed: number | null
  sizeLabel: string
  stageDims: { width: number; height: number }
  supportsLoras: boolean
  activeArch: string | null
  canGenerate: boolean
  studioLabel: string
  showCreator: boolean
  showDownloads: boolean
  showTools: boolean
  showGalleryRail: boolean
  showAdvancedRail: boolean
  toolsHandoff: ToolsHandoff | null
  setToolsHandoff: Dispatch<SetStateAction<ToolsHandoff | null>>
  /** Read and clear handoff (call once on tool page mount). */
  consumeToolsHandoff: () => ToolsHandoff | null
  openImageToPrompt: (handoff?: ToolsHandoff) => void
  openPromptEnhancer: (handoff?: ToolsHandoff) => void
  stageInsetLeft: string | undefined
  stageInsetRight: string | undefined
  handleGenerate: () => Promise<void>
  handleCancel: () => Promise<void>
  handleDeleteGalleryItem: (id: string) => Promise<void>
  handleReuseGalleryPrompt: (item: GalleryItem) => void
  handleReuseGallerySettings: (item: GalleryItem) => void
  requestBlueprintInstall: (id: string) => Promise<void>
  handleInstallBlueprint: (id: string) => Promise<void>
  handleInstallComfy: () => Promise<void>
  handleStartComfy: () => Promise<void>
  handleStopComfy: () => Promise<void>
  handleSaveHfToken: () => Promise<void>
  handleSaveCivitaiToken: () => Promise<void>
  handleHfTokenDialogConfirm: (token: string) => Promise<void>
  handleCivitaiTokenDialogConfirm: (token: string) => Promise<void>
  refreshBlueprints: () => void
  openCreatorEdit: (id: string) => void
  deleteUserLora: typeof deleteUserLora
  listLoras: typeof listLoras
  listBlueprints: typeof listBlueprints
  gallerySrc: typeof gallerySrc
  isInstalled: typeof isInstalled
  SIDE_RAIL_WIDTH: typeof SIDE_RAIL_WIDTH
}

const StudioContext = createContext<StudioContextValue | null>(null)

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext)
  if (!ctx) {
    throw new Error("useStudio must be used within StudioProvider")
  }
  return ctx
}

export function StudioProvider({ children }: { children: ReactNode }) {
  // Server + hydration assume desktop (Tauri-first) so SSR HTML matches the shell.
  // Browser `next dev` without Tauri flips to the fallback after hydrate.
  const desktop = useSyncExternalStore(subscribeNoop, isTauri, () => true)
  const pathname = usePathname()
  const router = useRouter()
  const studioTab = tabFromPath(pathname)
  const navigateTab = useCallback(
    (tab: StudioTab) => {
      router.push(`/${tab}`)
    },
    [router]
  )
  const navigateTabRef = useRef(navigateTab)

  const [blueprints, setBlueprints] = useState<Blueprint[]>([])
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
  const [upscaleEnabled, setUpscaleEnabled] = useState(false)
  const [upscaleModelId, setUpscaleModelId] = useState(DEFAULT_UPSCALE_MODEL_ID)
  const [usduEnabled, setUsduEnabled] = useState(false)
  const [usduScale, setUsduScale] = useState<2 | 4>(2)
  const [usduSteps, setUsduSteps] = useState(8)
  const [usduDenoise, setUsduDenoise] = useState(0.15)
  const [upscaleModels, setUpscaleModels] = useState<UpscaleModelInfo[]>([])
  const [usduReady, setUsduReady] = useState(false)
  const [loraStack, setLoraStack] = useState<LoraStackEntry[]>([])
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
  const [toolsHandoff, setToolsHandoff] = useState<ToolsHandoff | null>(null)
  const toolsHandoffRef = useRef<ToolsHandoff | null>(null)
  toolsHandoffRef.current = toolsHandoff

  const consumeToolsHandoff = useCallback((): ToolsHandoff | null => {
    const current = toolsHandoffRef.current
    if (current) {
      setToolsHandoff(null)
      toolsHandoffRef.current = null
    }
    return current
  }, [])

  const openImageToPrompt = useCallback(
    (handoff?: ToolsHandoff) => {
      if (handoff) setToolsHandoff(handoff)
      router.push("/tools/image-to-prompt")
    },
    [router]
  )

  const openPromptEnhancer = useCallback(
    (handoff?: ToolsHandoff) => {
      if (handoff) setToolsHandoff(handoff)
      router.push("/tools/prompt-enhancer")
    },
    [router]
  )
  const [aspectId, setAspectId] = useState<string>("1:1")
  const [sideLength, setSideLength] = useState(SIDE_LENGTH_DEFAULT)
  const aspectIdRef = useRef(aspectId)
  const sideLengthRef = useRef(sideLength)
  aspectIdRef.current = aspectId
  sideLengthRef.current = sideLength
  const [runtimes, setRuntimes] = useState<RuntimeInstall[]>([])
  const [gpu, setGpu] = useState<GpuInfo | null>(null)
  const [runtimeBusy, setRuntimeBusy] = useState(false)
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)
  const [comfyHealthy, setComfyHealthy] = useState(false)
  const [downloadSnapshot, setDownloadSnapshot] = useState<DownloadSnapshot>(
    EMPTY_DOWNLOAD_SNAPSHOT
  )
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

  function promotePendingPreview(loaded: string) {
    // Closure matches this keyed frame (not a newer pending).
    livePreviewSrcRef.current = loaded
    setLivePreviewSrc(loaded)
    if (pendingPreviewSrcRef.current === loaded) {
      pendingPreviewSrcRef.current = null
      setPendingPreviewSrc(null)
    }
  }

  const tabBlueprints = useMemo(() => {
    if (
      studioTab === "creator" ||
      studioTab === "downloads" ||
      studioTab === "tools"
    ) {
      return studioTab === "downloads" ? blueprints : []
    }
    return blueprints.filter((bp) => bp.category.toLowerCase() === studioTab)
  }, [blueprints, studioTab])

  const tabGallery = useMemo(() => {
    if (
      studioTab === "creator" ||
      studioTab === "downloads" ||
      studioTab === "tools"
    ) {
      return []
    }
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

  const latestGallerySeed = useMemo(() => {
    const recipe = tabGallery[0] ? parseGalleryRecipe(tabGallery[0]) : null
    const seed = Number(recipe?.values.seed)
    return Number.isFinite(seed) ? seed : null
  }, [tabGallery])

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
  }, [desktop])

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
          const up = upscaleFromRecipe(recipe, d.arch)
          setUpscaleEnabled(up.enabled)
          setUpscaleModelId(up.modelId)
          setUsduEnabled(up.usduEnabled)
          setUsduScale(up.usduScale)
          setUsduSteps(up.usduSteps)
          setUsduDenoise(up.usduDenoise)
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

  async function requestBlueprintInstall(id: string) {
    try {
      await ensureDownload({ kind: "blueprint", id }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Blueprint install failed"
      )
    }
  }

  async function handleInstallBlueprint(id: string) {
    if (!(await ensureInstallTokens(id))) return
    await requestBlueprintInstall(id)
  }

  async function beginLoraInstall(id: string, arch: string) {
    try {
      await ensureDownload({ kind: "lora", id, arch }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "LoRA install failed"
      )
    }
  }

  async function beginUpscaleInstall(id: string) {
    try {
      await ensureDownload({ kind: "upscale", id }, { wait: false })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Upscale install failed"
      )
    }
  }

  async function beginUsduInstall() {
    await beginUpscaleInstall("usdu")
  }

  async function beginPromptToolsInstall() {
    try {
      await ensureDownload(
        { kind: "promptTools", provider: "qwenvl" },
        { wait: false }
      )
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Prompt Tools install failed"
      )
    }
  }

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
      await ensureDownload(
        { kind: "runtime", engine: "comfyui" },
        { wait: false }
      )
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

  const selectBlueprint = useCallback((id: string) => {
    setSelectedId(id)
    preferredBlueprintIdRef.current = id
    void setSetting(SETTING_SELECTED_BLUEPRINT, id).catch(() => {})
  }, [])

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
      if (studioTab === "image" && upscaleEnabled) {
        values.upscale = {
          modelId: upscaleModelId || DEFAULT_UPSCALE_MODEL_ID,
          usdu: usduEnabled,
          ...(usduEnabled
            ? {
                usduScale,
                usduSteps,
                usduDenoise,
              }
            : {}),
        }
      } else {
        delete values.upscale
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

  const handleDeleteGalleryItem = useCallback(async (id: string) => {
    try {
      await deleteGalleryItem(id)
      notifySuccess("Image deleted")
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Delete failed")
      throw e
    }
  }, [])

  const handleReuseGalleryPrompt = useCallback((item: GalleryItem) => {
    const recipe = parseGalleryRecipe(item)
    if (!recipe?.prompt) {
      notifyInfo("No prompt", "This image has no reusable prompt.", "reuse")
      return
    }
    setSelectedGalleryId(item.id)
    setPrompt(recipe.prompt)
    notifySuccess("Prompt loaded", "From gallery image")
  }, [])

  const applyUpscaleFromRecipe = useCallback(
    (recipe: GalleryRecipe, arch?: string | null) => {
      const up = upscaleFromRecipe(recipe, arch)
      setUpscaleEnabled(up.enabled)
      setUpscaleModelId(up.modelId)
      setUsduEnabled(up.usduEnabled)
      setUsduScale(up.usduScale)
      setUsduSteps(up.usduSteps)
      setUsduDenoise(up.usduDenoise)
    },
    []
  )

  const handleReuseGallerySettings = useCallback(
    (item: GalleryItem) => {
      const recipe = parseGalleryRecipe(item)
      if (!recipe) {
        notifyInfo(
          "No settings",
          "This image has no reusable settings.",
          "reuse"
        )
        return
      }

      navigateTab(recipe.category)
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
          applyUpscaleFromRecipe(recipe, activeDetail.arch)
        } else {
          pendingRecipeRef.current = recipe
          selectBlueprint(recipe.blueprintId)
        }
      } else {
        setControlValues((prev) => applyReuseAllSettings(prev, recipe))
        setLoraStack(lorasFromRecipe(recipe, loraPacks))
        applyUpscaleFromRecipe(recipe, activeArch)
      }

      notifySuccess(
        "Settings loaded",
        recipe.blueprintName
          ? `From ${recipe.blueprintName}`
          : "From gallery image"
      )
    },
    [
      activeArch,
      activeDetail,
      activeSelectedId,
      applyUpscaleFromRecipe,
      loraPacks,
      navigateTab,
      selectBlueprint,
    ]
  )

  function refreshBlueprints() {
    void listBlueprints()
      .then(setBlueprints)
      .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
  }

  function openCreatorEdit(id: string) {
    setEditBlueprintId(id)
    router.push(`/creator?edit=${id}`)
  }

  const activeJobKey = downloadSnapshot.active?.jobKey ?? null
  const installingId = activeJobKey
    ? (blueprintIdFromJobKey(activeJobKey) ?? activeJobKey)
    : null
  const installQueue = downloadSnapshot.queued.map((job) => {
    const bp = blueprintIdFromJobKey(job.jobKey)
    return bp ?? job.jobKey
  })
  const loraInstallingKey = activeJobKey
    ? loraKeyFromJobKey(activeJobKey)
    : null
  const upscaleInstallingId = activeJobKey
    ? upscaleIdFromJobKey(activeJobKey)
    : null

  const studioLabel =
    STUDIO_TABS.find((tab) => tab.id === studioTab)?.label ?? "Image"
  const canGenerate = studioTab === "image"
  const showCreator = studioTab === "creator"
  const showDownloads = studioTab === "downloads"
  const showTools = studioTab === "tools"
  const showGalleryRail = !showCreator && !showDownloads && !showTools
  const showAdvancedRail = showGalleryRail && canGenerate
  const stageInsetLeft =
    showAdvancedRail && advancedOpen ? SIDE_RAIL_WIDTH : undefined
  const stageInsetRight =
    showGalleryRail && galleryOpen ? SIDE_RAIL_WIDTH : undefined

  const value: StudioContextValue = {
    desktop,
    studioTab,
    navigateTab,
    blueprints,
    setBlueprints,
    blueprintsLoaded,
    selectedId,
    selectBlueprint,
    pickerOpen,
    setPickerOpen,
    editBlueprintId,
    setEditBlueprintId,
    settingsOpen,
    setSettingsOpen,
    modelsOpen,
    setModelsOpen,
    loraPickerOpen,
    setLoraPickerOpen,
    loraPacks,
    setLoraPacks,
    loraStack,
    setLoraStack,
    loraInstallingKey,
    beginLoraInstall,
    upscaleEnabled,
    setUpscaleEnabled,
    upscaleModelId,
    setUpscaleModelId,
    usduEnabled,
    setUsduEnabled,
    usduScale,
    setUsduScale,
    usduSteps,
    setUsduSteps,
    usduDenoise,
    setUsduDenoise,
    upscaleModels,
    usduReady,
    upscaleInstallingId,
    beginUpscaleInstall,
    beginUsduInstall,
    beginPromptToolsInstall,
    downloadSnapshot,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    hfToken,
    setHfToken,
    hfTokenDirty,
    setHfTokenDirty,
    hfTokenSaving,
    hfTokenDialogOpen,
    setHfTokenDialogOpen,
    civitaiToken,
    setCivitaiToken,
    civitaiTokenDirty,
    setCivitaiTokenDirty,
    civitaiTokenSaving,
    civitaiTokenDialogOpen,
    setCivitaiTokenDialogOpen,
    pendingInstallId,
    setPendingInstallId,
    galleryOpen,
    setGalleryOpen,
    advancedOpen,
    setAdvancedOpen,
    prompt,
    setPrompt,
    aspectId,
    sideLength,
    applySize,
    runtimes,
    gpu,
    runtimeBusy,
    runtimeMessage,
    comfyHealthy,
    comfy,
    installingId,
    installQueue,
    sizesProbing,
    detail,
    activeDetail,
    controlValues,
    setControlValues,
    generating,
    activeJobId,
    livePreviewSrc,
    pendingPreviewSrc,
    clearLivePreview,
    queueLivePreview,
    promotePendingPreview,
    genStep,
    gallery,
    selectedGalleryId,
    setSelectedGalleryId,
    tabBlueprints,
    tabGallery,
    activeSelectedId,
    selected,
    previewItem,
    activeLoraStack,
    hasSizeControls,
    hasNegativePrompt,
    advancedControls,
    latestGallerySeed,
    sizeLabel,
    stageDims,
    supportsLoras,
    activeArch,
    canGenerate,
    studioLabel,
    showCreator,
    showDownloads,
    showTools,
    showGalleryRail,
    showAdvancedRail,
    toolsHandoff,
    setToolsHandoff,
    consumeToolsHandoff,
    openImageToPrompt,
    openPromptEnhancer,
    stageInsetLeft,
    stageInsetRight,
    handleGenerate,
    handleCancel,
    handleDeleteGalleryItem,
    handleReuseGalleryPrompt,
    handleReuseGallerySettings,
    requestBlueprintInstall,
    handleInstallBlueprint,
    handleInstallComfy,
    handleStartComfy,
    handleStopComfy,
    handleSaveHfToken,
    handleSaveCivitaiToken,
    handleHfTokenDialogConfirm,
    handleCivitaiTokenDialogConfirm,
    refreshBlueprints,
    openCreatorEdit,
    deleteUserLora,
    listLoras,
    listBlueprints,
    gallerySrc,
    isInstalled,
    SIDE_RAIL_WIDTH,
  }

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  )
}
