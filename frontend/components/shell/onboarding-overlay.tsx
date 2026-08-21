"use client"

import { useEffect, useRef, useState } from "react"
import { ImageIcon } from "lucide-react"
import { BrandMark } from "@/components/brand/brand-mark"
import {
  vendorOptionsFromAdapters,
  type GpuVendorOption,
} from "@/components/dialogs/gpu-vendor-dialog"
import { OnboardingErrorAlert } from "@/components/shell/onboarding-error-alert"
import { OnboardingInstallProgress } from "@/components/shell/onboarding-install-progress"
import { Titlebar } from "@/components/shell/titlebar"
import { blueprintIdFromJobKey } from "@/components/studio/slices/job-keys"
import { SETTING_GPU_VENDOR } from "@/components/studio/slices/setting-keys"
import { useStudioStore } from "@/components/studio/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMediaQuery } from "@/hooks/use-media-query"
import { isInstalled } from "@/lib/blueprint-helpers"
import { beginDataDirMove, endDataDirMove } from "@/lib/data-dir-move"
import {
  detectGpu,
  gallerySrc,
  getDataDirInfo,
  getSystemSpecs,
  isTauri,
  listDownloads,
  listSettings,
  openExternalUrl,
  pickDataDir,
  relaunchApp,
  setDataDir,
  setProviderToken,
  setSetting,
  type Blueprint,
  type DataDirInfo,
  type GpuVendor,
  type SystemSpecs,
} from "@/lib/host"
import {
  bytesToGb,
  formatSpecGb,
  isComfyInstalling,
  isComfyReady,
  meetsMinimumSpecs,
  mergeSystemSpecs,
  MIN_RAM_GB,
  MIN_VRAM_GB,
  needsOnboarding,
  officialBlueprintsForOnboarding,
  parseOnboardingState,
  partitionRecommended,
  REC_RAM_GB,
  REC_VRAM_GB,
  recommendedBlurb,
  resolveOnboardingStep,
  serializeOnboardingState,
  SETTING_ONBOARDING,
  stepAfterStorage,
  type OnboardingState,
  type OnboardingStep,
} from "@/lib/onboarding"
import { cn } from "@/lib/utils"

const HF_TOKENS_URL =
  "https://huggingface.co/settings/tokens/new?preset=read-only"

const EXIT_MS = 350
/** Opacity-only handoff — no blur/slide (those stutter on heavy steps). */
const STAGE_FADE_MS = 100

const STEP_LABEL: Record<OnboardingStep, string> = {
  specs: "Hardware",
  storage: "Storage",
  gpu: "GPU",
  hf: "Hugging Face",
  blueprint: "Blueprint",
  install: "Install",
}

type Phase = "hidden" | "enter" | "run" | "exit"
type StageAnim = "shown" | "exit" | "enter"

export function OnboardingOverlay() {
  const startupHydrated = useStudioStore((s) => s.startupHydrated)
  const blueprintsLoaded = useStudioStore((s) => s.blueprintsLoaded)
  const blueprints = useStudioStore((s) => s.blueprints)
  const runtimes = useStudioStore((s) => s.runtimes)
  const gpu = useStudioStore((s) => s.gpu)
  const hasHfToken = useStudioStore((s) => s.hasHfToken)
  const setRuntimeBusy = useStudioStore((s) => s.setRuntimeBusy)
  const runtimeMessage = useStudioStore((s) => s.runtimeMessage)
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)
  const setDownloadSnapshot = useStudioStore((s) => s.setDownloadSnapshot)
  const downloadSpeedBps = useStudioStore((s) => s.downloadSpeedBps)
  const handleInstallComfy = useStudioStore((s) => s.handleInstallComfy)
  const requestBlueprintInstall = useStudioStore(
    (s) => s.requestBlueprintInstall
  )
  const selectBlueprint = useStudioStore((s) => s.selectBlueprint)
  const refreshProviderTokenStatus = useStudioStore(
    (s) => s.refreshProviderTokenStatus
  )
  const setGpu = useStudioStore((s) => s.setGpu)
  const setGpuVendorDialogOpen = useStudioStore((s) => s.setGpuVendorDialogOpen)
  const setOnboardingCoverReady = useStudioStore(
    (s) => s.setOnboardingCoverReady
  )

  const [phase, setPhase] = useState<Phase>("hidden")
  const [step, setStep] = useState<OnboardingStep>("hf")
  const [blueprintId, setBlueprintId] = useState<string | null>(null)
  const [hfSkipped, setHfSkipped] = useState(false)
  const [specsBypassed, setSpecsBypassed] = useState(false)
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [gpuSelected, setGpuSelected] = useState<GpuVendor | null>(null)
  const [gpuBusy, setGpuBusy] = useState(false)
  const [gpuError, setGpuError] = useState<string | null>(null)
  const [hfToken, setHfToken] = useState("")
  const [hfBusy, setHfBusy] = useState(false)
  const [hfError, setHfError] = useState<string | null>(null)
  const [storageInfo, setStorageInfo] = useState<DataDirInfo | null>(null)
  const [storageMode, setStorageMode] = useState<"default" | "custom">(
    "default"
  )
  const [customStoragePath, setCustomStoragePath] = useState<string | null>(
    null
  )
  const [storageBusy, setStorageBusy] = useState(false)
  const [storageError, setStorageError] = useState<{
    title: string
    description: string
  } | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installKick, setInstallKick] = useState(0)
  const installStartedRef = useRef({ comfy: false, blueprint: false })
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const [stageStep, setStageStep] = useState<OnboardingStep>("blueprint")
  const [stageAnim, setStageAnim] = useState<StageAnim>("shown")

  const active = isTauri() && needsOnboarding(runtimes, blueprints)
  const readyToShow =
    active && startupHydrated && blueprintsLoaded && bootstrapped

  // Load persisted progress once hydrate + catalog are ready.
  useEffect(() => {
    if (!isTauri() || !startupHydrated || !blueprintsLoaded || bootstrapped) {
      return
    }
    let cancelled = false
    void (async () => {
      const [settings, dataDir, specsRaw, gpuInfo] = await Promise.all([
        listSettings().catch(() => ({}) as Record<string, string>),
        getDataDirInfo().catch(() => null),
        getSystemSpecs().catch(() => null),
        detectGpu().catch(() => null),
      ])
      if (cancelled) return
      if (dataDir) setStorageInfo(dataDir)
      if (gpuInfo) setGpu(gpuInfo)
      const gpu = gpuInfo ?? useStudioStore.getState().gpu
      const specs = mergeSystemSpecs(specsRaw, gpu)
      setSystemSpecs(specs)
      const vendor = settings[SETTING_GPU_VENDOR]?.trim() || ""
      const persisted = parseOnboardingState(settings[SETTING_ONBOARDING])
      const nextStep = resolveOnboardingStep({
        persisted,
        gpu,
        savedVendor: vendor,
        storageChosen: dataDir?.storageChosen ?? true,
        specs,
      })
      await refreshProviderTokenStatus()
      if (cancelled) return
      const hasToken = useStudioStore.getState().hasHfToken
      const catalog = officialBlueprintsForOnboarding(
        useStudioStore.getState().blueprints
      )
      const preferred = persisted?.blueprintId
      const blueprintIdNext =
        (preferred && catalog.some((b) => b.id === preferred)
          ? preferred
          : null) ??
        catalog.find((b) => b.id === "krea2-turbo")?.id ??
        catalog[0]?.id ??
        null
      // Already have a token: skip the optional HF step when resuming there.
      let stepNext = nextStep
      if (stepNext === "hf" && hasToken) {
        stepNext = blueprintIdNext ? "install" : "blueprint"
      }
      setStep(stepNext)
      setStageStep(stepNext)
      setStageAnim("shown")
      setBlueprintId(blueprintIdNext)
      setHfSkipped(Boolean(persisted?.hfSkipped))
      setSpecsBypassed(Boolean(persisted?.specsBypassed))
      setBootstrapped(true)
      // First-run GPU pick lives in this overlay — never open the dialog.
      setGpuVendorDialogOpen(false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    startupHydrated,
    blueprintsLoaded,
    bootstrapped,
    refreshProviderTokenStatus,
    setGpu,
    setGpuVendorDialogOpen,
  ])

  // Show: hidden → enter, then a separate effect advances to run.
  // Defer setState out of the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!(readyToShow && phase === "hidden")) return
    const id = requestAnimationFrame(() => setPhase("enter"))
    return () => cancelAnimationFrame(id)
  }, [readyToShow, phase])

  useEffect(() => {
    if (phase !== "enter") return
    const id = requestAnimationFrame(() => setPhase("run"))
    return () => cancelAnimationFrame(id)
  }, [phase])

  useEffect(() => {
    if (!(!active && (phase === "enter" || phase === "run"))) return
    let hideAt = 0
    const id = requestAnimationFrame(() => {
      setPhase("exit")
      hideAt = window.setTimeout(() => setPhase("hidden"), EXIT_MS)
    })
    return () => {
      cancelAnimationFrame(id)
      window.clearTimeout(hideAt)
    }
  }, [active, phase])

  // Signal StartupOverlay only once we're fully covering (opaque shell + content).
  useEffect(() => {
    const covering = phase === "run"
    setOnboardingCoverReady(covering)
    return () => setOnboardingCoverReady(false)
  }, [phase, setOnboardingCoverReady])

  // Opacity handoff between steps (footer + brand chrome stay put).
  useEffect(() => {
    if (!bootstrapped || step === stageStep) return
    if (reducedMotion) {
      const id = requestAnimationFrame(() => {
        setStageStep(step)
        setStageAnim("shown")
      })
      return () => cancelAnimationFrame(id)
    }
    let cancelled = false
    const startExit = requestAnimationFrame(() => setStageAnim("exit"))
    const exitAt = window.setTimeout(() => {
      if (cancelled) return
      setStageStep(step)
      setStageAnim("enter")
    }, STAGE_FADE_MS)
    return () => {
      cancelled = true
      cancelAnimationFrame(startExit)
      window.clearTimeout(exitAt)
    }
  }, [step, stageStep, bootstrapped, reducedMotion])

  // One paint at opacity 0, then fade in — timer beats nested rAF in tests/Tauri.
  useEffect(() => {
    if (stageAnim !== "enter") return
    const enterAt = window.setTimeout(
      () => setStageAnim("shown"),
      reducedMotion ? 0 : 16
    )
    return () => window.clearTimeout(enterAt)
  }, [stageAnim, reducedMotion])

  const options: GpuVendorOption[] = gpu
    ? vendorOptionsFromAdapters(gpu.adapters)
    : []
  const gpuChoice = gpuSelected ?? options[0]?.vendor ?? null

  const catalog = officialBlueprintsForOnboarding(blueprints)
  const { recommended, rest } = partitionRecommended(catalog)
  const comfy = runtimes.find((r) => r.engine === "comfyui")
  const selectedBp = blueprintId
    ? blueprints.find((b) => b.id === blueprintId)
    : null
  const showGpuBack = Boolean(gpu?.needsVendorChoice)

  const activeBpJob =
    downloadSnapshot.active?.kind === "blueprint" &&
    blueprintId &&
    blueprintIdFromJobKey(downloadSnapshot.active.jobKey) === blueprintId
      ? downloadSnapshot.active
      : null
  const runtimeJobPending =
    downloadSnapshot.active?.kind === "runtime" ||
    downloadSnapshot.queued.some((j) => j.kind === "runtime")
  const failedRuntimeJob = !runtimeJobPending
    ? downloadSnapshot.active?.kind === "runtime" &&
      downloadSnapshot.active.status === "error"
      ? downloadSnapshot.active
      : ([...downloadSnapshot.history]
          .reverse()
          .find((j) => j.kind === "runtime" && j.status === "error") ?? null)
    : null
  const derivedInstallError =
    step === "install"
      ? comfy?.status === "error"
        ? comfy.error || "ComfyUI install failed"
        : failedRuntimeJob
          ? failedRuntimeJob.error || "ComfyUI install failed"
          : activeBpJob?.status === "error"
            ? activeBpJob.error || "Blueprint install failed"
            : null
      : null
  const displayInstallError = installError ?? derivedInstallError

  async function advance(
    next: Partial<OnboardingState> & { step: OnboardingStep }
  ) {
    const state: OnboardingState = {
      step: next.step,
      blueprintId:
        next.blueprintId !== undefined ? next.blueprintId : blueprintId,
      hfSkipped: next.hfSkipped !== undefined ? next.hfSkipped : hfSkipped,
      specsBypassed:
        next.specsBypassed !== undefined ? next.specsBypassed : specsBypassed,
    }
    setStep(state.step)
    setBlueprintId(state.blueprintId)
    setHfSkipped(state.hfSkipped)
    setSpecsBypassed(state.specsBypassed)
    await setSetting(SETTING_ONBOARDING, serializeOnboardingState(state)).catch(
      () => {}
    )
  }

  async function continueFromSpecs(bypass: boolean) {
    const dataDir = storageInfo
    const storageChosen = dataDir?.storageChosen ?? true
    await advance({
      step: storageChosen ? stepAfterStorage(gpu, undefined) : "storage",
      specsBypassed: bypass || specsBypassed,
    })
  }

  async function confirmGpu() {
    if (!gpuChoice) return
    setGpuError(null)
    setGpuBusy(true)
    try {
      await setSetting(SETTING_GPU_VENDOR, gpuChoice)
      await advance({ step: "blueprint" })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setGpuError(message)
    } finally {
      setGpuBusy(false)
    }
  }

  async function confirmStorage(path: string | null) {
    setStorageBusy(true)
    setStorageError(null)
    let moving = false
    try {
      // Only show the blocking overlay when relocating an existing library.
      const prior = storageInfo
      const willMove =
        prior?.storageChosen &&
        path != null &&
        path.trim() !== "" &&
        path !== prior.path
      if (willMove) {
        beginDataDirMove("Pausing queue and preparing move…")
        moving = true
      }
      const result = await setDataDir(path)
      const info = await getDataDirInfo().catch(() => null)
      if (info) setStorageInfo(info)
      if (result.needsRestart) {
        await relaunchApp()
        return
      }
      if (moving) {
        endDataDirMove()
        moving = false
      }
      await advance({
        step: stepAfterStorage(gpu, undefined),
      })
    } catch (e) {
      if (moving) endDataDirMove()
      const message = e instanceof Error ? e.message : String(e)
      setStorageError({
        title: "Could not set data folder",
        description: message,
      })
    } finally {
      setStorageBusy(false)
    }
  }

  async function selectCustomStorage() {
    setStorageMode("custom")
    setStorageError(null)
    try {
      const picked = await pickDataDir()
      if (!picked) return
      setCustomStoragePath(picked)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setStorageError({
        title: "Could not choose folder",
        description: message,
      })
    }
  }

  async function confirmStorageChoice() {
    // Continue stays disabled in custom mode until a folder is picked.
    if (storageMode === "custom") {
      if (!customStoragePath) return
      await confirmStorage(customStoragePath)
      return
    }
    await confirmStorage(null)
  }

  async function saveHfAndContinue() {
    const token = hfToken.trim()
    if (!token) return
    setHfBusy(true)
    setHfError(null)
    try {
      await setProviderToken("huggingFace", token)
      await refreshProviderTokenStatus()
      setHfToken("")
      installStartedRef.current = { comfy: false, blueprint: false }
      setInstallError(null)
      await advance({ step: "install", hfSkipped: false })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setHfError(message)
    } finally {
      setHfBusy(false)
    }
  }

  async function skipHf() {
    installStartedRef.current = { comfy: false, blueprint: false }
    setInstallError(null)
    await advance({ step: "install", hfSkipped: true })
  }

  async function confirmBlueprint() {
    if (!blueprintId) return
    if (hasHfToken) {
      installStartedRef.current = { comfy: false, blueprint: false }
      setInstallError(null)
      await advance({ step: "install", blueprintId, hfSkipped: false })
      return
    }
    await advance({ step: "hf", blueprintId })
  }

  // Finish onboarding once Comfy + blueprint are both ready.
  useEffect(() => {
    if (step !== "install" || !blueprintId || phase === "hidden") return
    const bp = blueprints.find((b) => b.id === blueprintId)
    if (isComfyReady(runtimes) && bp && isInstalled(bp)) {
      selectBlueprint(blueprintId)
      void setSetting(SETTING_ONBOARDING, "").catch(() => {})
    }
  }, [step, blueprintId, phase, runtimes, blueprints, selectBlueprint])

  // Kick Comfy install. Keep deps narrow — including runtimeBusy/downloadSnapshot
  // re-ran this effect mid-invoke, cancelled the async, and showed a fake
  // "did not start" error while swallowing the real failure.
  useEffect(() => {
    if (step !== "install" || !blueprintId || phase === "hidden") return
    if (isComfyReady(runtimes)) return
    if (comfy?.status === "error" || failedRuntimeJob) {
      installStartedRef.current.comfy = false
      return
    }
    if (runtimeJobPending || isComfyInstalling(runtimes)) return
    if (installStartedRef.current.comfy) return

    let showError = true
    installStartedRef.current.comfy = true
    void (async () => {
      try {
        await handleInstallComfy()
        const snap = await listDownloads()
        setDownloadSnapshot(snap)
        const hasRuntime =
          snap.active?.kind === "runtime" ||
          snap.queued.some((j) => j.kind === "runtime")
        if (!hasRuntime) {
          throw new Error(
            "ComfyUI install did not queue a download job. Tap Retry."
          )
        }
      } catch (e) {
        installStartedRef.current.comfy = false
        setRuntimeBusy(false)
        if (showError) {
          setInstallError(e instanceof Error ? e.message : String(e))
        }
      }
    })()

    return () => {
      showError = false
    }
  }, [
    step,
    blueprintId,
    phase,
    runtimes,
    comfy?.status,
    failedRuntimeJob,
    runtimeJobPending,
    handleInstallComfy,
    setDownloadSnapshot,
    setRuntimeBusy,
    installKick,
  ])

  // Enqueue blueprint only after Comfy is fully done (including extensions).
  useEffect(() => {
    if (step !== "install" || !blueprintId || phase === "hidden") return
    if (!isComfyReady(runtimes) || runtimeJobPending) return
    if (activeBpJob?.status === "error") {
      installStartedRef.current.blueprint = false
      return
    }

    const bp = blueprints.find((b) => b.id === blueprintId)
    if (!bp || isInstalled(bp) || installStartedRef.current.blueprint) return

    const bpJobMatch = (job: { kind: string; jobKey: string }) =>
      job.kind === "blueprint" &&
      blueprintIdFromJobKey(job.jobKey) === blueprintId
    const activeBp =
      downloadSnapshot.active != null && bpJobMatch(downloadSnapshot.active)
    const queuedBp = downloadSnapshot.queued.some(bpJobMatch)
    if (activeBp || queuedBp) {
      installStartedRef.current.blueprint = true
      return
    }

    let showError = true
    installStartedRef.current.blueprint = true
    void (async () => {
      try {
        await requestBlueprintInstall(blueprintId)
      } catch (e) {
        installStartedRef.current.blueprint = false
        if (showError) {
          setInstallError(e instanceof Error ? e.message : String(e))
        }
      }
    })()

    return () => {
      showError = false
    }
  }, [
    step,
    blueprintId,
    phase,
    runtimes,
    blueprints,
    runtimeJobPending,
    activeBpJob?.status,
    downloadSnapshot,
    requestBlueprintInstall,
    installKick,
  ])

  function retryInstall() {
    installStartedRef.current = { comfy: false, blueprint: false }
    setInstallError(null)
    // Mid-extract quit leaves runtimeBusy true with a failed history job.
    setRuntimeBusy(false)
    const comfyReadyNow = isComfyReady(runtimes)
    void (async () => {
      if (!comfyReadyNow) {
        installStartedRef.current.comfy = true
        try {
          await handleInstallComfy()
          const snap = await listDownloads()
          setDownloadSnapshot(snap)
        } catch (e) {
          setInstallError(e instanceof Error ? e.message : String(e))
          installStartedRef.current.comfy = false
        }
        setInstallKick((n) => n + 1)
        return
      }
      if (blueprintId) {
        installStartedRef.current.blueprint = true
        try {
          await requestBlueprintInstall(blueprintId)
        } catch (e) {
          setInstallError(e instanceof Error ? e.message : String(e))
          installStartedRef.current.blueprint = false
        }
      }
      setInstallKick((n) => n + 1)
    })()
  }

  if (phase === "hidden" || !readyToShow) return null

  // Configure marks the runtime "ready" before the extensions step finishes —
  // keep the Comfy title while a runtime job is still active/queued.
  const installPhaseLabel =
    !isComfyReady(runtimes) || runtimeJobPending
      ? "Installing ComfyUI"
      : selectedBp && !isInstalled(selectedBp)
        ? `Installing ${selectedBp.name}`
        : "Finishing setup"

  const stageTitle =
    stageStep === "specs"
      ? "This PC may be under-powered"
      : stageStep === "storage"
        ? "Choose data folder"
        : stageStep === "gpu"
          ? "Choose your GPU"
          : stageStep === "hf"
            ? "Hugging Face token"
            : stageStep === "blueprint"
              ? "Pick your first Blueprint"
              : installPhaseLabel

  const stageBusy = stageAnim === "exit" || stageAnim === "enter"
  // Footer tracks the visible stage so chrome doesn't jump mid-handoff.
  const footerStep = stageStep
  const detectedRamGb = bytesToGb(systemSpecs?.ramBytes)
  const detectedVramGb = bytesToGb(systemSpecs?.vramBytes)

  const canReturnToSpecs =
    systemSpecs != null && !meetsMinimumSpecs(systemSpecs)

  const footerBack =
    footerStep === "storage" && canReturnToSpecs ? (
      <Button
        type="button"
        variant="ghost"
        disabled={storageBusy || stageBusy}
        onClick={() =>
          void advance({
            step: "specs",
            blueprintId,
            hfSkipped,
            specsBypassed: false,
          })
        }
      >
        Back
      </Button>
    ) : footerStep === "gpu" ? (
      <Button
        type="button"
        variant="ghost"
        disabled={gpuBusy || stageBusy}
        onClick={() =>
          void advance({
            step: "storage",
            blueprintId,
            hfSkipped,
          })
        }
      >
        Back
      </Button>
    ) : footerStep === "blueprint" && showGpuBack ? (
      <Button
        type="button"
        variant="ghost"
        disabled={stageBusy}
        onClick={() =>
          void advance({
            step: "gpu",
            blueprintId,
            hfSkipped,
          })
        }
      >
        Back
      </Button>
    ) : footerStep === "blueprint" && !showGpuBack ? (
      <Button
        type="button"
        variant="ghost"
        disabled={stageBusy}
        onClick={() =>
          void advance({
            step: "storage",
            blueprintId,
            hfSkipped,
          })
        }
      >
        Back
      </Button>
    ) : footerStep === "hf" ? (
      <Button
        type="button"
        variant="ghost"
        disabled={hfBusy || stageBusy}
        onClick={() =>
          void advance({
            step: "blueprint",
            blueprintId,
            hfSkipped,
          })
        }
      >
        Back
      </Button>
    ) : (
      <span />
    )

  const footerPrimary =
    footerStep === "specs" ? (
      <Button
        type="button"
        disabled={stageBusy}
        onClick={() => void continueFromSpecs(true)}
      >
        Continue anyway
      </Button>
    ) : footerStep === "storage" ? (
      <Button
        type="button"
        disabled={
          storageBusy ||
          stageBusy ||
          (storageMode === "custom" && !customStoragePath)
        }
        onClick={() => void confirmStorageChoice()}
      >
        {storageBusy ? "Saving…" : "Continue"}
      </Button>
    ) : footerStep === "gpu" ? (
      <Button
        type="button"
        disabled={!gpuChoice || gpuBusy || stageBusy}
        onClick={() => void confirmGpu()}
      >
        {gpuBusy ? "Saving…" : "Continue"}
      </Button>
    ) : footerStep === "blueprint" ? (
      <Button
        type="button"
        disabled={
          !blueprintId ||
          !catalog.some((b) => b.id === blueprintId) ||
          stageBusy
        }
        onClick={() => void confirmBlueprint()}
      >
        Continue
      </Button>
    ) : footerStep === "hf" ? (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={hfBusy || stageBusy}
          onClick={() => void skipHf()}
        >
          Skip for now
        </Button>
        <Button
          type="button"
          disabled={!hfToken.trim() || hfBusy || stageBusy}
          onClick={() => void saveHfAndContinue()}
        >
          {hfBusy ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    ) : displayInstallError ? (
      <Button type="button" onClick={retryInstall}>
        Retry
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground tabular-nums">
        Installing…
      </span>
    )

  return (
    <div
      className={cn(
        // Above toasts (z-110). StartupOverlay stays higher so it can hand off
        // without flashing studio.
        "fixed inset-0 z-[120] flex flex-col bg-background",
        phase === "exit" && "opacity-0 transition-opacity duration-300 ease-out"
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Set up Open Gen Studio"
    >
      <Titlebar
        leading={
          <div className="flex items-center gap-2 text-sm font-medium">
            <BrandMark className="size-4" />
            <span className="hidden sm:inline">Open Gen Studio</span>
          </div>
        }
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_48%,#141416_0%,transparent_70%)]"
        />

        <div
          className={cn(
            // Stable column: centered stage above a fixed footer.
            "relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4",
            phase === "enter" && "opacity-0",
            phase === "run" &&
              "opacity-100 transition-opacity duration-300 ease-out"
          )}
        >
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col py-6",
              // Tall blueprint grid fills the stage; shorter steps stay centered.
              stageStep === "blueprint"
                ? "overflow-hidden"
                : "justify-center overflow-y-auto"
            )}
          >
            <div
              key={stageStep}
              className={cn(
                "mx-auto flex w-full flex-col",
                stageStep === "blueprint"
                  ? "h-full min-h-0 max-w-4xl"
                  : "max-w-lg",
                !reducedMotion && "transition-opacity duration-100 ease-out",
                (stageAnim === "exit" || stageAnim === "enter") && "opacity-0",
                stageAnim === "shown" && "opacity-100"
              )}
            >
              <h1 className="mb-3 shrink-0 text-center font-heading text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {stageTitle}
              </h1>

              {stageStep === "specs" ? (
                <div className="flex flex-col gap-4">
                  <p className="text-center text-sm text-muted-foreground">
                    Open Gen Studio runs image models locally. This machine
                    looks short of the recommended hardware — generation may be
                    slow, fail, or be unavailable.
                  </p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-muted/40 text-[0.6875rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                        <tr>
                          <th className="px-3 py-2 font-medium"> </th>
                          <th className="px-3 py-2 font-medium">This PC</th>
                          <th className="px-3 py-2 font-medium">Minimum</th>
                          <th className="px-3 py-2 font-medium">Recommended</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2.5 font-medium">RAM</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              detectedRamGb != null &&
                                detectedRamGb < MIN_RAM_GB &&
                                "text-destructive"
                            )}
                          >
                            {formatSpecGb(detectedRamGb)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                            {MIN_RAM_GB} GB
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                            {REC_RAM_GB} GB
                          </td>
                        </tr>
                        <tr className="border-t border-border">
                          <td className="px-3 py-2.5 font-medium">GPU VRAM</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 tabular-nums",
                              (detectedVramGb == null ||
                                detectedVramGb < MIN_VRAM_GB) &&
                                "text-destructive"
                            )}
                          >
                            {formatSpecGb(detectedVramGb)}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                            {MIN_VRAM_GB} GB
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                            {REC_VRAM_GB} GB
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {systemSpecs?.gpuName ? (
                    <p className="text-center text-xs text-muted-foreground">
                      Detected GPU: {systemSpecs.gpuName}
                    </p>
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      No supported discrete GPU was detected. Integrated
                      graphics usually cannot run these models.
                    </p>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    You can continue anyway — setup will still run, but expect
                    limited results on this hardware.
                  </p>
                </div>
              ) : null}

              {stageStep === "storage" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-center text-sm text-muted-foreground">
                    AI Models can use tens of gigabytes. Pick a drive with
                    enough free space.
                    <br />
                    Minimum 50GB - Recommended 400GB.
                    <br />
                    You can change and migrate your data later in Settings.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={storageBusy}
                      onClick={() => {
                        setStorageMode("default")
                        setStorageError(null)
                      }}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        storageMode === "default"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <span className="font-medium">Default location</span>
                      <span className="font-mono text-xs break-all text-muted-foreground">
                        {storageInfo?.defaultPath ??
                          storageInfo?.locatorPath ??
                          storageInfo?.path ??
                          "…"}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={storageBusy}
                      onClick={() => void selectCustomStorage()}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        storageMode === "custom"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <span className="font-medium">Custom location</span>
                      <span className="text-xs break-all text-muted-foreground">
                        {customStoragePath ? (
                          <span className="font-mono">{customStoragePath}</span>
                        ) : (
                          "Choose a folder on another drive…"
                        )}
                      </span>
                    </button>
                  </div>
                  {storageError ? (
                    <OnboardingErrorAlert
                      title={storageError.title}
                      description={storageError.description}
                    />
                  ) : null}
                </div>
              ) : null}

              {stageStep === "gpu" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-center text-sm text-muted-foreground">
                    This PC has more than one GPU vendor. Pick which one to use
                    for generation.
                    <br />
                    You can change your GPU selection later in Settings.
                  </p>
                  <div className="flex flex-col gap-2">
                    {options.map(({ vendor, adapter }, index) => {
                      const activeVendor = gpuChoice === vendor
                      return (
                        <button
                          key={vendor}
                          type="button"
                          disabled={gpuBusy}
                          onClick={() => setGpuSelected(vendor)}
                          className={cn(
                            "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                            activeVendor
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          )}
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="font-medium">
                              {vendor === "nvidia"
                                ? "NVIDIA"
                                : vendor === "amd"
                                  ? "AMD"
                                  : "Intel"}
                            </span>
                            {index === 0 ? (
                              <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                                Recommended
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {adapter.name}
                            {adapter.memoryTotal
                              ? ` · ${adapter.memoryTotal}`
                              : ""}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {gpuError ? (
                    <OnboardingErrorAlert
                      title="Could not save GPU"
                      description={gpuError}
                    />
                  ) : null}
                </div>
              ) : null}

              {stageStep === "blueprint" ? (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  <p className="shrink-0 text-center text-sm text-muted-foreground">
                    Official Blueprints only. Start with a recommended pick.
                    <br />
                    You can install more later from the library.
                  </p>
                  <div className="relative min-h-0 flex-1">
                    <ScrollArea
                      className="absolute inset-0"
                      scrollFade
                      scrollbarGutter
                    >
                      <div className="space-y-5 pb-2">
                        {recommended.length > 0 ? (
                          <BlueprintGridSection
                            title="Recommended"
                            items={recommended}
                            selectedId={blueprintId}
                            onSelect={setBlueprintId}
                            blurbFor={recommendedBlurb}
                          />
                        ) : null}
                        {rest.length > 0 ? (
                          <BlueprintGridSection
                            title="More Official"
                            items={rest}
                            selectedId={blueprintId}
                            onSelect={setBlueprintId}
                          />
                        ) : null}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              ) : null}

              {stageStep === "hf" ? (
                <div className="flex flex-col gap-3">
                  <p className="text-center text-sm text-muted-foreground">
                    Optional — a Hugging Face token helps avoid download
                    throttling. You can skip this and add one later in Settings.
                  </p>
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="hf_…"
                    value={hfToken}
                    onChange={(e) => setHfToken(e.target.value)}
                    aria-label="Hugging Face access token"
                  />
                  <button
                    type="button"
                    className="text-left text-xs text-primary underline-offset-2 hover:underline"
                    onClick={() => void openExternalUrl(HF_TOKENS_URL)}
                  >
                    Create a read-only token on Hugging Face
                  </button>
                  {hfError ? (
                    <OnboardingErrorAlert
                      title="Could not save token"
                      description={hfError}
                    />
                  ) : null}
                </div>
              ) : null}

              {stageStep === "install" ? (
                <div className="flex flex-col items-center">
                  <OnboardingInstallProgress
                    snapshot={downloadSnapshot}
                    blueprintId={blueprintId}
                    comfyReady={isComfyReady(runtimes)}
                    speedBps={downloadSpeedBps}
                    runtimeMessage={runtimeMessage}
                    error={displayInstallError}
                    onRetry={retryInstall}
                    hideRetry
                  />
                </div>
              ) : null}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border/50 py-4">
            <div className="grid min-h-9 grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex min-w-0 items-center justify-start">
                {footerBack}
              </div>
              <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                Setup · {STEP_LABEL[stageStep]}
              </p>
              <div className="flex min-w-0 items-center justify-end">
                {footerPrimary}
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

function BlueprintGridSection({
  title,
  items,
  selectedId,
  onSelect,
  blurbFor,
}: {
  title: string
  items: Blueprint[]
  selectedId: string | null
  onSelect: (id: string) => void
  blurbFor?: (id: string) => string | null
}) {
  return (
    <section className="flex flex-col gap-3">
      <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((bp) => (
          <BlueprintChoice
            key={bp.id}
            bp={bp}
            description={blurbFor?.(bp.id) ?? bp.description}
            selected={selectedId === bp.id}
            onSelect={() => onSelect(bp.id)}
          />
        ))}
      </div>
    </section>
  )
}

function BlueprintChoice({
  bp,
  description,
  selected,
  onSelect,
}: {
  bp: Blueprint
  description: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors",
        selected
          ? "border-primary ring-1 ring-primary/40"
          : "border-border hover:border-white/20"
      )}
    >
      <span className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {bp.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallerySrc(bp.thumbnailPath)}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <ImageIcon
              className="size-8 text-muted-foreground opacity-40"
              aria-hidden
            />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 p-2.5">
        <span className="line-clamp-1 text-sm font-medium">{bp.name}</span>
        {description ? (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}
