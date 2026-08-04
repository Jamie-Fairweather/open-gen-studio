"use client"

import { useEffect, useSyncExternalStore, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  comfyuiStatus,
  detectGpu,
  getOfficialBlueprint,
  isTauri,
  listBlueprints,
  listDownloads,
  listGallery,
  listJobQueue,
  listLoras,
  listRuntimes,
  listSettings,
  listUpscalers,
  setSetting,
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
  type UpscaleModelInfo,
} from "@/lib/host"
import {
  applyReuseAllSettings,
  lorasFromRecipe,
  pickDefaultBlueprintId,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import { formatBytes, formatEta } from "@/lib/format"
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
import {
  SETTING_ADVANCED_OPEN,
  SETTING_GALLERY_OPEN,
  SETTING_GPU_VENDOR,
  SETTING_SELECTED_BLUEPRINT,
  SETTING_STUDIO_SESSION,
} from "@/components/studio/slices/helpers"
import {
  filterSessionLoras,
  flushPersistSession,
  isKnownToolsPath,
  overlaySessionControls,
  parseStudioSession,
  resolveSessionUpscaleModelId,
} from "@/components/studio/slices/session-persist"
import {
  selectActiveSelectedId,
  selectTabGallery,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { tabFromPath } from "@/components/studio/studio-tabs"

const subscribeNoop = () => () => {}

/** Dismiss-gate for the splash: session + catalog must be applied first. */
function tryMarkStartupHydrated() {
  const s = useStudioStore.getState()
  if (s.startupHydrated) return
  if (!s.blueprintsLoaded || !s.galleryLoaded) return
  if (!studioRefs.startupCatalogReady) return
  if (studioRefs.suppressSessionPersist) return
  s.setStartupHydrated(true)
}

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

  // Persist toolsPath as current route when entering/leaving /tools.
  useEffect(() => {
    if (!studioRefs.suppressSessionPersist) {
      flushPersistSession()
    }
  }, [pathname])

  useEffect(() => {
    studioRefs.navigateTab = (tab) => {
      router.push(`/${tab}`)
    }
    studioRefs.pushPath = (path) => {
      router.push(path)
    }
  }, [router])

  // Drop gallery selection that is not on the current media tab.
  // Skip tools/downloads/creator/settings — those tabs have no gallery filter
  // and must not wipe a restored (or in-progress) selection.
  const selectedGalleryId = useStudioStore((s) => s.selectedGalleryId)
  const gallery = useStudioStore((s) => s.gallery)
  useEffect(() => {
    if (
      studioTab === "tools" ||
      studioTab === "downloads" ||
      studioTab === "creator" ||
      studioTab === "settings"
    ) {
      return
    }
    const tabGallery = selectTabGallery(useStudioStore.getState())
    if (
      selectedGalleryId != null &&
      !tabGallery.some((item) => item.id === selectedGalleryId)
    ) {
      useStudioStore.getState().setSelectedGalleryId(null)
      flushPersistSession()
    }
  }, [selectedGalleryId, gallery, studioTab])

  // Load blueprint detail when selection changes.
  const activeSelectedId = useStudioSelector(selectActiveSelectedId)

  useEffect(() => {
    if (!activeSelectedId || !isTauri()) return
    let cancelled = false
    const prefetch = studioRefs.detailPrefetch
    const detailPromise =
      prefetch?.id === activeSelectedId
        ? prefetch.promise
        : getOfficialBlueprint(activeSelectedId)
    if (prefetch?.id === activeSelectedId) {
      studioRefs.detailPrefetch = null
    }
    void detailPromise
      .then((d) => {
        if (cancelled) return
        const store = useStudioStore.getState()
        store.setDetail(d)
        const recipe = studioRefs.pendingRecipe
        studioRefs.pendingRecipe = null
        // Recipe (user reuse) wins over restored session for this detail load.
        const session = recipe ? null : studioRefs.pendingSession
        if (recipe || session) {
          studioRefs.pendingSession = null
        }
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
        } else if (session) {
          values = overlaySessionControls(
            next,
            session,
            d.controls.map((c) => c.id)
          )
          studioRefs.aspectId = session.aspectId
          studioRefs.sideLength = session.sideLength
          store.setAspectId(session.aspectId)
          store.setSideLength(session.sideLength)
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
          } else if (session) {
            const width = Number(values.width)
            const height = Number(values.height)
            if (Number.isFinite(width) && Number.isFinite(height)) {
              // Prefer restored control width/height; keep aspect refs in sync.
              const synced = syncSizeControls(width, height)
              studioRefs.aspectId = synced.aspectId
              studioRefs.sideLength = synced.sideLength
              store.setAspectId(synced.aspectId)
              store.setSideLength(synced.sideLength)
              values = { ...values, width, height }
            } else {
              const sized = sizeFromAspectAndSide(
                session.aspectId,
                session.sideLength || SIDE_LENGTH_DEFAULT
              )
              values = { ...values, ...sized }
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
        const hadSession = Boolean(session)
        studioRefs.suppressSessionPersist = false
        tryMarkStartupHydrated()
        if (hadSession) flushPersistSession()
      })
      .catch((e) => {
        if (!cancelled) {
          studioRefs.pendingSession = null
          studioRefs.suppressSessionPersist = false
          tryMarkStartupHydrated()
          notifyError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeSelectedId, desktop])

  // Settings page: refresh token status when opened (secrets never leave Rust).
  useEffect(() => {
    if (studioTab !== "settings" || !isTauri()) return
    let cancelled = false
    void useStudioStore
      .getState()
      .refreshProviderTokenStatus()
      .then(() => {
        if (cancelled) return
        const store = useStudioStore.getState()
        store.setHfToken("")
        store.setHfTokenDirty(false)
        store.setCivitaiToken("")
        store.setCivitaiTokenDirty(false)
      })
    return () => {
      cancelled = true
    }
  }, [studioTab])

  // Tauri event listeners + initial load.
  useEffect(() => {
    // `desktop` is true during SSR/hydrate (getServerSnapshot); only talk to
    // the host once Tauri IPC is actually present.
    if (!isTauri()) {
      useStudioStore.getState().setStartupHydrated(true)
      return
    }

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
    let unlistenJobQueue: (() => void) | undefined
    let unlistenGallery: (() => void) | undefined
    let unlistenGalleryDeleted: (() => void) | undefined
    let unlistenLorasUpdated: (() => void) | undefined
    let unlistenLoraProgress: (() => void) | undefined
    let unlistenUpscalersUpdated: (() => void) | undefined
    let unlistenUpscaleProgress: (() => void) | undefined
    let unlistenPromptToolsProgress: (() => void) | undefined

    const SPEED_WINDOW_MS = 20_000
    const SPEED_MIN_MS = 5_000
    let speedSamples: { t: number; bytes: number; url: string }[] = []
    let emaSpeed = 0
    let publishedSpeed = 0

    async function load() {
      const ensureDetailPrefetch = (id: string | null) => {
        if (!id) return
        if (studioRefs.detailPrefetch?.id === id) return
        studioRefs.detailPrefetch = {
          id,
          promise: getOfficialBlueprint(id),
        }
      }

      studioRefs.startupCatalogReady = false

      try {
        // Listeners must not block Tier A fetches.
        void onBlueprintProbe((p) => {
          store().setSizesProbing(p.stage === "start")
        }).then((u) => {
          unlistenBlueprintProbe = u
        })
        void onBlueprintSizes((bps) => {
          store().setBlueprints(bps)
          store().setSizesProbing(false)
          store().setSelectedId((prev) =>
            pickDefaultBlueprintId(bps, prev ?? studioRefs.preferredBlueprintId)
          )
        }).then((u) => {
          unlistenBlueprintSizes = u
        })

        let settingsReady = false
        let session: ReturnType<typeof parseStudioSession> = null

        const releaseSuppressIfReady = (selected: string | null) => {
          if (!settingsReady) return
          if (!session) {
            studioRefs.suppressSessionPersist = false
            tryMarkStartupHydrated()
            return
          }
          if (!selected) {
            // No blueprint to load detail for — release suppress so later edits persist.
            studioRefs.pendingSession = null
            studioRefs.suppressSessionPersist = false
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
          studioRefs.preferredBlueprintId = preferred
          session = parseStudioSession(settings[SETTING_STUDIO_SESSION])
          settingsReady = true

          const s = store()
          await s.refreshProviderTokenStatus()
          s.setHfToken("")
          s.setHfTokenDirty(false)
          s.setCivitaiToken("")
          s.setCivitaiTokenDirty(false)
          if (settings[SETTING_GALLERY_OPEN] === "1") s.setGalleryOpen(true)
          if (settings[SETTING_ADVANCED_OPEN] === "1") s.setAdvancedOpen(true)

          if (preferred) ensureDetailPrefetch(preferred)

          if (session) {
            studioRefs.suppressSessionPersist = true
            studioRefs.pendingSession = session

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
              s.setLoraStack(
                filterSessionLoras(session.loraStack, knownLoraIds)
              )
            }
            if (s.upscaleModels.length > 0) {
              const knownUpscaleIds = new Set(s.upscaleModels.map((u) => u.id))
              s.setUpscaleModelId(
                resolveSessionUpscaleModelId(
                  session.upscaleModelId,
                  knownUpscaleIds
                )
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
          const s = store()
          s.setBlueprints(bps)
          s.setBlueprintsLoaded(true)
          // Wait for settings so session/preferred id exist before selecting
          // (avoids detail load racing ahead of pendingSession).
          if (settingsReady) {
            const nextBlueprintId = pickDefaultBlueprintId(
              bps,
              studioRefs.preferredBlueprintId
            )
            s.setSelectedId((prev) =>
              pickDefaultBlueprintId(
                bps,
                prev ?? studioRefs.preferredBlueprintId
              )
            )
            ensureDetailPrefetch(nextBlueprintId)
            releaseSuppressIfReady(nextBlueprintId)
          }
          return bps
        })

        const galleryP = listGallery().then((items) => {
          const s = store()
          s.setGallery(items)
          s.setGalleryLoaded(true)
          applyGallerySelection(items)
          tryMarkStartupHydrated()
          return items
        })

        const lorasP = listLoras().then((loras) => {
          const s = store()
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
            const s = store()
            s.setUpscaleModels(upscalers)
            if (session) {
              const knownUpscaleIds = new Set(upscalers.map((u) => u.id))
              s.setUpscaleModelId(
                resolveSessionUpscaleModelId(
                  session.upscaleModelId,
                  knownUpscaleIds
                )
              )
            }
            return upscalers
          })

        const usduP = usduNodeReady()
          .catch(() => false)
          .then((usdu) => {
            store().setUsduReady(usdu)
            return usdu
          })

        const runtimesP = listRuntimes().then((rts) => {
          store().setRuntimes(rts)
          return rts
        })

        void comfyuiStatus().then((status) => {
          store().setComfyHealthy(status.healthy)
        })

        // Tier D: GPU + downloads — apply when ready, never block Tier A.
        void detectGpu().then(async (gpuInfo) => {
          const s = store()
          s.setGpu(gpuInfo)
          const settings = await settingsP.catch(() => null)
          if (!settings) return
          const savedVendor = settings[SETTING_GPU_VENDOR]?.trim() || ""
          if (gpuInfo.available && gpuInfo.adapters.length > 0) {
            const vendors = [...new Set(gpuInfo.adapters.map((a) => a.vendor))]
            if (vendors.length === 1 && !savedVendor) {
              void setSetting(SETTING_GPU_VENDOR, vendors[0]).catch(() => {})
            } else if (gpuInfo.needsVendorChoice && !savedVendor) {
              s.setGpuVendorDialogOpen(true)
            }
          }
        })

        void Promise.all([
          runtimesP,
          listDownloads().catch(() => EMPTY_DOWNLOAD_SNAPSHOT),
        ])
          .then(([rts, snap]) => {
            const s = store()
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
            }
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
      } catch (e) {
        const s = store()
        s.setSizesProbing(false)
        s.setBlueprintsLoaded(true)
        s.setGalleryLoaded(true)
        studioRefs.pendingSession = null
        studioRefs.suppressSessionPersist = false
        studioRefs.startupCatalogReady = true
        // Settings may have failed before selection — still pick a default.
        if (!s.selectedId && s.blueprints.length > 0) {
          const nextId = pickDefaultBlueprintId(
            s.blueprints,
            studioRefs.preferredBlueprintId
          )
          s.setSelectedId(nextId)
          ensureDetailPrefetch(nextId)
        }
        tryMarkStartupHydrated()
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
      const runtimeJobActive =
        store().downloadSnapshot.active?.kind === "runtime"
      store().setRuntimeBusy(
        runtime.status === "installing" ||
          runtime.status === "starting" ||
          runtimeJobActive
      )
      if (runtime.status === "ready") {
        store().setComfyHealthy(false)
        if (!runtimeJobActive) {
          store().setRuntimeMessage("Runtime ready")
          store().setRuntimeBusy(false)
        }
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
      store().setRuntimeMessage(p.message)
      if (p.stage === "done") {
        store().setRuntimeBusy(false)
        notifySuccess("Runtime Installed", p.message)
      } else if (p.stage === "ready") {
        store().setRuntimeBusy(false)
        store().setComfyHealthy(true)
        notifyProgress("runtime", "Runtime ready", p.message, true)
      } else if (p.stage === "error") {
        store().setRuntimeBusy(false)
        store().setComfyHealthy(false)
        notifyError(p.message, "Runtime error")
      } else if (p.stage === "start") {
        notifyProgress("runtime", "Starting runtime", p.message)
      }
      // extract / configure / download: message only — detail lives on Downloads
    }).then((u) => {
      unlistenProgress = u
    })

    void onDownloadProgress((p) => {
      const now = performance.now()
      const trackedBytes = p.downloaded
      if (p.done) {
        speedSamples = []
        emaSpeed = 0
        publishedSpeed = 0
        store().setDownloadSpeedBps(0)
      } else if (p.total != null && p.total > trackedBytes) {
        // Keep EMA across files so overall ETA doesn't collapse between steps.
        if (speedSamples.length > 0 && speedSamples[0]!.url !== p.url) {
          speedSamples = []
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
              emaSpeed > 0 ? emaSpeed * 0.95 + windowSpeed * 0.05 : windowSpeed
            // Only publish meaningful changes - cuts UI thrash from tiny speed noise.
            const delta = Math.abs(emaSpeed - publishedSpeed)
            if (
              publishedSpeed === 0 ||
              delta / publishedSpeed > 0.06 ||
              delta > 256 * 1024
            ) {
              publishedSpeed = emaSpeed
              store().setDownloadSpeedBps(emaSpeed)
            }
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
        etaSuffix = ` · ${formatBytes(emaSpeed)}/s · ETA ${formatEta(remain / emaSpeed)}`
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
      const terminal =
        job.status === "completed" ||
        job.status === "failed" ||
        job.status === "cancelled"
      if (terminal) {
        // Defensive: prune even if jobs://queue was missed (ghost "running" chips).
        store().setJobQueue((prev) => prev.filter((i) => i.jobId !== job.id))
      }
      if (job.kind !== "generate") return
      if (terminal) {
        const stillGenerating = store().jobQueue.some(
          (i) => i.kind === "generate" && i.jobId !== job.id
        )
        store().setGenerating(stillGenerating)
        store().setActiveJobId((id) => (id === job.id ? null : id))
        if (!stillGenerating) store().clearLivePreview()
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
      if (store().handleToolJobProgress(p)) return

      if (p.stage !== "start") {
        notifyDismiss("runtime")
      }
      if (p.stage === "step") {
        if (p.step != null && p.max != null && p.max > 0) {
          store().setGenStep({
            jobId: p.jobId,
            step: p.step,
            max: p.max,
          })
        }
        return
      }
      if (p.stage === "preview") {
        if (p.previewPath) store().queueLivePreview(p.previewPath)
        return
      }
      if (p.stage === "done") {
        store().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
        const stillGenerating = store().jobQueue.some(
          (i) => i.kind === "generate" && i.jobId !== p.jobId
        )
        store().setGenerating(stillGenerating)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        if (!stillGenerating) store().clearLivePreview()
      } else if (p.stage === "cancelled") {
        store().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
        const stillGenerating = store().jobQueue.some(
          (i) => i.kind === "generate" && i.jobId !== p.jobId
        )
        store().setGenerating(stillGenerating)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        if (!stillGenerating) store().clearLivePreview()
        notifyInfo("Cancelled", p.message, "job")
      } else if (p.stage === "error") {
        store().setJobQueue((prev) => prev.filter((i) => i.jobId !== p.jobId))
        const stillGenerating = store().jobQueue.some(
          (i) => i.kind === "generate" && i.jobId !== p.jobId
        )
        store().setGenerating(stillGenerating)
        store().setActiveJobId((id) => (id === p.jobId ? null : id))
        if (!stillGenerating) store().clearLivePreview()
        notifyError(p.message, "Generation failed")
      } else if (p.stage === "start") {
        notifyProgress("runtime", "Starting runtime", p.message)
      }
    }).then((u) => {
      unlistenJobProgress = u
    })

    void listJobQueue()
      .then((snap) => store().setJobQueue(snap.items))
      .catch(() => {})
    void onJobQueue((snap) => {
      store().setJobQueue(snap.items)
      const runningGenerate = snap.items.find(
        (i) => i.kind === "generate" && i.status === "running"
      )
      const anyGenerate = snap.items.some((i) => i.kind === "generate")
      store().setGenerating(anyGenerate)
      if (runningGenerate) {
        store().setActiveJobId(runningGenerate.jobId)
      } else if (!anyGenerate) {
        store().setActiveJobId(null)
      }
    }).then((u) => {
      unlistenJobQueue = u
    })

    void onGalleryUpdated((item) => {
      const s = store()
      if (s.gallery.some((x) => x.id === item.id)) {
        s.patchGalleryItem(item)
      } else {
        s.ingestGalleryItem(item)
      }
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
      const installingRuntime =
        store().downloadSnapshot.active?.kind === "runtime" ||
        store().runtimes.some(
          (r) => r.engine === "comfyui" && r.status === "installing"
        )
      if (installingRuntime && p.message) {
        store().setRuntimeMessage(p.message)
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
      if (p.message) store().handlePromptToolsStatus(p.message)
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
      unlistenJobQueue?.()
      unlistenGallery?.()
      unlistenGalleryDeleted?.()
      unlistenLorasUpdated?.()
      unlistenLoraProgress?.()
      unlistenUpscalersUpdated?.()
      unlistenUpscaleProgress?.()
      unlistenPromptToolsProgress?.()
    }
  }, [desktop, router])

  return children
}
