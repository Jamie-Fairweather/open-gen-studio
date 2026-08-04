"use client"

import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { getOfficialBlueprint, isTauri } from "@/lib/host"
import {
  applyReuseAllSettings,
  lorasFromRecipe,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import {
  SIDE_LENGTH_DEFAULT,
  sizeFromAspectAndSide,
  syncSizeControls,
} from "@/lib/image-size"
import { notifyError } from "@/lib/notify"
import {
  flushPersistSession,
  overlayControlValues,
  overlaySessionControls,
} from "@/components/studio/slices/session-persist"
import { selectActiveSelectedId } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { tabFromPath } from "@/components/studio/studio-tabs"
import {
  cleanupHostListeners,
  registerHostListeners,
} from "@/components/studio/bootstrap/host-listeners"
import {
  runStartupLoadSafe,
  tryMarkStartupHydrated,
} from "@/components/studio/bootstrap/startup-hydrate"

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

  // Sync before paint so tab-scoped selectors don't lag a frame behind the route.
  useLayoutEffect(() => {
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

  // Drop selection only when the item is gone entirely. Keep it across
  // image/video/audio (and tools/settings) so returning to a tab restores it;
  // tab-scoped UI already ignores off-tab ids.
  const selectedGalleryId = useStudioStore((s) => s.selectedGalleryId)
  const gallery = useStudioStore((s) => s.gallery)
  const galleryLoaded = useStudioStore((s) => s.galleryLoaded)
  useEffect(() => {
    if (!galleryLoaded || selectedGalleryId == null) return
    if (!gallery.some((item) => item.id === selectedGalleryId)) {
      useStudioStore.getState().setSelectedGalleryId(null)
      flushPersistSession()
    }
  }, [selectedGalleryId, gallery, galleryLoaded])

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
        const prevDetailId = store.detail?.id ?? null
        const prevControlValues = store.controlValues
        // Snapshot leaving blueprint so image↔video/audio round-trips keep seed/etc.
        if (prevDetailId && prevDetailId !== d.id) {
          studioRefs.controlValuesByBlueprintId[prevDetailId] = {
            ...prevControlValues,
          }
        }
        store.setDetail(d)
        const recipe = studioRefs.pendingRecipe
        studioRefs.pendingRecipe = null
        // Recipe (user reuse) wins over restored session for this detail load.
        const session = recipe ? null : studioRefs.pendingSession
        if (recipe || session) {
          studioRefs.pendingSession = null
        }
        const controlIds = d.controls.map((c) => c.id)
        const next: Record<string, unknown> = {}
        for (const c of d.controls) {
          if (c.default !== undefined) {
            next[c.id] = c.default
          }
        }
        let values = recipe ? applyReuseAllSettings(next, recipe) : next
        let restoredControls = false
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
          values = overlaySessionControls(next, session, controlIds)
          studioRefs.aspectId = session.aspectId
          studioRefs.sideLength = session.sideLength
          store.setAspectId(session.aspectId)
          store.setSideLength(session.sideLength)
          restoredControls = true
        } else if (prevDetailId === d.id) {
          // Same blueprint re-load (e.g. effect re-run) — keep live values.
          values = overlayControlValues(next, prevControlValues, controlIds)
          restoredControls = true
        } else {
          const stashed = studioRefs.controlValuesByBlueprintId[d.id]
          if (stashed) {
            values = overlayControlValues(next, stashed, controlIds)
            restoredControls = true
          }
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
          } else if (restoredControls) {
            const width = Number(values.width)
            const height = Number(values.height)
            if (Number.isFinite(width) && Number.isFinite(height)) {
              const synced = syncSizeControls(width, height)
              studioRefs.aspectId = synced.aspectId
              studioRefs.sideLength = synced.sideLength
              store.setAspectId(synced.aspectId)
              store.setSideLength(synced.sideLength)
              values = { ...values, width, height }
            } else if (session) {
              const sized = sizeFromAspectAndSide(
                session.aspectId,
                session.sideLength || SIDE_LENGTH_DEFAULT
              )
              values = { ...values, ...sized }
            } else {
              const { width: w, height: h } = sizeFromAspectAndSide(
                studioRefs.aspectId,
                studioRefs.sideLength || SIDE_LENGTH_DEFAULT
              )
              values = { ...values, width: w, height: h }
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

    const getStore = () => useStudioStore.getState()
    const handles = registerHostListeners(getStore)
    void runStartupLoadSafe(router, getStore)

    return () => {
      cleanupHostListeners(handles)
    }
  }, [desktop, router])

  return children
}
