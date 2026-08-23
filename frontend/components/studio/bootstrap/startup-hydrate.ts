import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import {
  comfyuiStatus,
  detectGpu,
  getOfficialBlueprint,
  listBlueprints,
  listDownloads,
  listGallery,
  listLoras,
  listRuntimes,
  listSettings,
  listUpscalers,
  setSetting,
  usduNodeReady,
  type UpscaleModelInfo,
} from "@/lib/host"
import { pickDefaultBlueprintId } from "@/lib/blueprint-helpers"
import { notifyError, notifyInfo } from "@/lib/notify"
import { EMPTY_DOWNLOAD_SNAPSHOT } from "@/components/studio/slices/downloads"
import {
  SETTING_ADVANCED_OPEN,
  SETTING_GALLERY_OPEN,
  SETTING_GPU_VENDOR,
  SETTING_SELECTED_BLUEPRINT,
  SETTING_STUDIO_SESSION,
} from "@/components/studio/slices/helpers"
import {
  filterSessionLoras,
  isKnownToolsPath,
  parseStudioSession,
  resolveSessionUpscaleModelId,
} from "@/components/studio/slices/session-persist"
import { useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { blueprintSession } from "@/lib/blueprint-session/state"

/** Dismiss-gate for the splash: session + catalog must be applied first. */
export function tryMarkStartupHydrated() {
  const s = useStudioStore.getState()
  if (s.startupHydrated) return
  if (!s.blueprintsLoaded || !s.galleryLoaded) return
  if (!studioRefs.startupCatalogReady) return
  if (blueprintSession.suppressImagePersist) return
  s.setStartupHydrated(true)
}

type Store = ReturnType<typeof useStudioStore.getState>

/** Tiered initial load: settings/blueprints/gallery first, catalog second, GPU/downloads async. */
export async function runStartupLoad(
  router: AppRouterInstance,
  getStore: () => Store = () => useStudioStore.getState()
) {
  const ensureDetailPrefetch = (id: string | null) => {
    if (!id) return
    if (blueprintSession.detailPrefetch?.id === id) return
    blueprintSession.detailPrefetch = {
      id,
      promise: getOfficialBlueprint(id),
    }
  }

  studioRefs.startupCatalogReady = false

  let settingsReady = false
  let session: ReturnType<typeof parseStudioSession> = null

  const releaseSuppressIfReady = (selected: string | null) => {
    if (!session) {
      blueprintSession.suppressImagePersist = false
      tryMarkStartupHydrated()
      return
    }
    if (!selected) {
      // No blueprint to load detail for — release suppress so later edits persist.
      blueprintSession.pendingSession = null
      blueprintSession.suppressImagePersist = false
      tryMarkStartupHydrated()
    }
    // else: keep suppress until blueprint-detail effect merges controlValues
  }

  const applyGallerySelection = (
    items: Awaited<ReturnType<typeof listGallery>>
  ) => {
    if (!session) return
    const galleryIds = new Set(items.map((item) => item.id))
    if (
      session.selectedGalleryId &&
      galleryIds.has(session.selectedGalleryId)
    ) {
      useStudioStore.setState({
        selectedGalleryId: session.selectedGalleryId,
        followLive: session.followLive,
      })
    } else {
      useStudioStore.setState({
        selectedGalleryId: null,
        followLive: true,
      })
    }
  }

  const settingsP = listSettings().then(async (settings) => {
    const preferred = settings[SETTING_SELECTED_BLUEPRINT]?.trim() || null
    blueprintSession.preferredBlueprintId = preferred
    session = parseStudioSession(settings[SETTING_STUDIO_SESSION])
    settingsReady = true

    const s = getStore()
    await s.refreshProviderTokenStatus()
    s.setHfToken("")
    s.setHfTokenDirty(false)
    s.setCivitaiToken("")
    s.setCivitaiTokenDirty(false)
    if (settings[SETTING_GALLERY_OPEN] === "1") s.setGalleryOpen(true)
    if (settings[SETTING_ADVANCED_OPEN] === "1") s.setAdvancedOpen(true)

    if (preferred) ensureDetailPrefetch(preferred)

    if (session) {
      blueprintSession.suppressImagePersist = true
      blueprintSession.pendingSession = session

      s.setPrompt(session.prompt)
      studioRefs.aspectId = session.aspectId
      studioRefs.sideLength = session.sideLength
      s.setAspectId(session.aspectId)
      s.setSideLength(session.sideLength)
      s.setUpscaleEnabled(session.upscaleEnabled)
      s.setUsduEnabled(session.usduEnabled)
      s.setUsduScale(session.usduScale)
      s.setUsduSteps(session.usduSteps)
      s.setUsduDenoise(session.usduDenoise)

      s.setImageToPrompt((prev) => ({
        ...prev,
        ...session!.imageToPrompt,
        busy: false,
        status: null,
        error: null,
        jobId: null,
      }))
      s.setPromptEnhance((prev) => ({
        ...prev,
        ...session!.promptEnhance,
        busy: false,
        status: null,
        error: null,
        jobId: null,
      }))

      if (isKnownToolsPath(session.toolsPath)) {
        router.replace(session.toolsPath)
      }

      if (s.galleryLoaded) applyGallerySelection(s.gallery)
      if (s.loraPacks.length > 0) {
        const knownLoraIds = new Set(s.loraPacks.map((p) => p.id))
        s.setLoraStack(filterSessionLoras(session.loraStack, knownLoraIds))
      }
      if (s.upscaleModels.length > 0) {
        const knownUpscaleIds = new Set(s.upscaleModels.map((u) => u.id))
        s.setUpscaleModelId(
          resolveSessionUpscaleModelId(session.upscaleModelId, knownUpscaleIds)
        )
      }
    }

    if (s.blueprintsLoaded) {
      const nextId = pickDefaultBlueprintId(s.blueprints, preferred)
      s.setSelectedId((prev) =>
        pickDefaultBlueprintId(s.blueprints, prev ?? preferred)
      )
      ensureDetailPrefetch(nextId)
      releaseSuppressIfReady(nextId)
    }

    return settings
  })

  const blueprintsP = listBlueprints().then((bps) => {
    const s = getStore()
    s.setBlueprints(bps)
    s.setBlueprintsLoaded(true)
    // Wait for settings so session/preferred id exist before selecting
    // (avoids detail load racing ahead of pendingSession).
    if (settingsReady) {
      const nextBlueprintId = pickDefaultBlueprintId(
        bps,
        blueprintSession.preferredBlueprintId
      )
      s.setSelectedId((prev) =>
        pickDefaultBlueprintId(
          bps,
          prev ?? blueprintSession.preferredBlueprintId
        )
      )
      ensureDetailPrefetch(nextBlueprintId)
      releaseSuppressIfReady(nextBlueprintId)
    }
    return bps
  })

  const galleryP = listGallery().then((items) => {
    const s = getStore()
    s.setGallery(items)
    s.setGalleryLoaded(true)
    applyGallerySelection(items)
    tryMarkStartupHydrated()
    return items
  })

  const lorasP = listLoras().then((loras) => {
    const s = getStore()
    s.setLoraPacks(loras)
    if (session) {
      const knownLoraIds = new Set(loras.map((p) => p.id))
      s.setLoraStack(filterSessionLoras(session.loraStack, knownLoraIds))
    }
    return loras
  })

  const upscalersP = listUpscalers()
    .catch(() => [] as UpscaleModelInfo[])
    .then((upscalers) => {
      const s = getStore()
      s.setUpscaleModels(upscalers)
      if (session) {
        const knownUpscaleIds = new Set(upscalers.map((u) => u.id))
        s.setUpscaleModelId(
          resolveSessionUpscaleModelId(session.upscaleModelId, knownUpscaleIds)
        )
      }
      return upscalers
    })

  const usduP = usduNodeReady()
    .catch(() => false)
    .then((usdu) => {
      getStore().setUsduReady(usdu)
      return usdu
    })

  const runtimesP = listRuntimes().then((rts) => {
    getStore().setRuntimes(rts)
    return rts
  })

  void comfyuiStatus().then((status) => {
    getStore().setComfyHealthy(status.healthy)
  })

  // Tier D: GPU + downloads — apply when ready, never block Tier A.
  void detectGpu().then(async (gpuInfo) => {
    const s = getStore()
    s.setGpu(gpuInfo)
    const settings = await settingsP.catch(() => null)
    if (!settings) return
    const savedVendor = settings[SETTING_GPU_VENDOR]?.trim() || ""
    if (gpuInfo.available && gpuInfo.adapters.length > 0) {
      const vendors = [...new Set(gpuInfo.adapters.map((a) => a.vendor))]
      if (vendors.length === 1 && !savedVendor) {
        void setSetting(SETTING_GPU_VENDOR, vendors[0]).catch(() => {})
      }
      // Mixed vendors: OnboardingOverlay owns first-run GPU pick (not GpuVendorDialog).
    }
  })

  void Promise.all([
    runtimesP,
    listDownloads().catch(() => EMPTY_DOWNLOAD_SNAPSHOT),
  ])
    .then(([rts, snap]) => {
      const s = getStore()
      s.setDownloadSnapshot(snap)
      const runtimeJob =
        snap.active?.kind === "runtime" ||
        snap.queued.some((j) => j.kind === "runtime")
      const installingDb = rts.some(
        (r) => r.engine === "comfyui" && r.status === "installing"
      )
      const installing = installingDb || runtimeJob
      s.setRuntimeBusy(installing)
      if (installing) {
        const ver =
          rts.find((r) => r.engine === "comfyui")?.version?.trim() ||
          snap.active?.title?.match(/ComfyUI\s+(v[\d.]+)/i)?.[1] ||
          snap.queued
            .find((j) => j.kind === "runtime")
            ?.title?.match(/ComfyUI\s+(v[\d.]+)/i)?.[1] ||
          ""
        s.setRuntimeMessage("Installing ComfyUI in the background…")
        notifyInfo(
          "Installing Runtime",
          ver ? `Installing ComfyUI ${ver}` : "Installing ComfyUI…",
          "runtime-install"
        )
        return
      }
      // Warm the runtime on launch so Generate isn't the first cold start.
      s.maybeAutoStartComfy()
    })
    .catch(() => {})

  // Surface Tier A failures; later tiers notify independently.
  await Promise.all([settingsP, blueprintsP, galleryP])
  // Catalog (LoRAs/upscalers) is part of restored session — hold overlay.
  await Promise.all([lorasP, upscalersP, usduP]).catch((e) => {
    notifyError(e instanceof Error ? e.message : String(e))
  })
  studioRefs.startupCatalogReady = true
  tryMarkStartupHydrated()
  void runtimesP.catch(() => {})
}

export async function runStartupLoadSafe(
  router: AppRouterInstance,
  getStore: () => Store = () => useStudioStore.getState()
) {
  const ensureDetailPrefetch = (id: string | null) => {
    if (!id) return
    if (blueprintSession.detailPrefetch?.id === id) return
    blueprintSession.detailPrefetch = {
      id,
      promise: getOfficialBlueprint(id),
    }
  }

  try {
    await runStartupLoad(router, getStore)
  } catch (e) {
    const s = getStore()
    s.setSizesProbing(false)
    s.setBlueprintsLoaded(true)
    s.setGalleryLoaded(true)
    blueprintSession.pendingSession = null
    blueprintSession.suppressImagePersist = false
    studioRefs.startupCatalogReady = true
    // Settings may have failed before selection — still pick a default.
    if (!s.selectedId && s.blueprints.length > 0) {
      const nextId = pickDefaultBlueprintId(
        s.blueprints,
        blueprintSession.preferredBlueprintId
      )
      s.setSelectedId(nextId)
      ensureDetailPrefetch(nextId)
    }
    tryMarkStartupHydrated()
    notifyError(e instanceof Error ? e.message : String(e))
  }
}
