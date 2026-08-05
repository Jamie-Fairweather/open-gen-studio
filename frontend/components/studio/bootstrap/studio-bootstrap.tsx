"use client"

import {
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { getOfficialBlueprint, isTauri } from "@/lib/host"
import { notifyError } from "@/lib/notify"
import { flushPersistSession } from "@/components/studio/slices/session-persist"
import { selectActiveSelectedId } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { tabFromPath } from "@/components/studio/studio-tabs"
import { applyLoadedBlueprintDetail } from "@/components/studio/bootstrap/bootstrap-helpers"
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

  // Load blueprint detail when selection changes (or picker re-selects).
  const activeSelectedId = useStudioSelector(selectActiveSelectedId)
  const detailReloadToken = useStudioStore((s) => s.detailReloadToken)

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
        applyLoadedBlueprintDetail(d)
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
  }, [activeSelectedId, desktop, detailReloadToken])

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
