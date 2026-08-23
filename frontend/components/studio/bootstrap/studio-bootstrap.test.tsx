/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"

const {
  state,
  router,
  isTauri,
  getOfficialBlueprint,
  applyLoadedBlueprintDetail,
  registerHostListeners,
  cleanupHostListeners,
  runStartupLoadSafe,
  tryMarkStartupHydrated,
  flushPersistImageSession,
  flushPersistToolsSession,
  notifyError,
  tabFromPath,
  studioRefs,
  blueprintSession,
} = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  const studioRefs = {
    navigateTab: null as null | ((t: string) => void),
    pushPath: null as null | ((p: string) => void),
  }
  const blueprintSession = {
    suppressImagePersist: false,
    detailPrefetch: null as null | { id: string; promise: Promise<unknown> },
    pendingSession: null as unknown,
  }
  return {
    state,
    router: { push: vi.fn(), replace: vi.fn() },
    isTauri: vi.fn(() => true),
    getOfficialBlueprint: vi.fn(async (id: string) => ({
      id,
      name: "BP",
      arch: "z-image",
      models: [],
      controls: [],
      defaults: {},
      capabilities: { negative: false, loras: true },
    })),
    applyLoadedBlueprintDetail: vi.fn(),
    registerHostListeners: vi.fn(() => ({})),
    cleanupHostListeners: vi.fn(),
    runStartupLoadSafe: vi.fn(async () => {}),
    tryMarkStartupHydrated: vi.fn(),
    flushPersistImageSession: vi.fn(),
    flushPersistToolsSession: vi.fn(),
    blueprintSession,
    notifyError: vi.fn(),
    tabFromPath: vi.fn(() => "image"),
    studioRefs,
  }
})

vi.mock("next/navigation", () => ({
  usePathname: () => "/image",
  useRouter: () => router,
}))
vi.mock("@/lib/host", () => ({
  isTauri: () => isTauri(),
  getOfficialBlueprint: (...a: unknown[]) => getOfficialBlueprint(...a),
}))
vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
}))
vi.mock("../store", () => ({
  useStudioStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel(state),
    { getState: () => state }
  ),
  useStudioSelector: () => "bp1",
}))
vi.mock("../studio-tabs", () => ({
  tabFromPath: (...a: unknown[]) => tabFromPath(...a),
}))
vi.mock("../slices/session-persist", () => ({
  flushPersistImageSession: (...a: unknown[]) => flushPersistImageSession(...a),
  flushPersistToolsSession: (...a: unknown[]) => flushPersistToolsSession(...a),
}))
vi.mock("@/lib/blueprint-session/state", () => ({
  blueprintSession,
}))
vi.mock("./bootstrap-helpers", () => ({
  applyLoadedBlueprintDetail: (...a: unknown[]) =>
    applyLoadedBlueprintDetail(...a),
}))
vi.mock("./host-listeners", () => ({
  registerHostListeners: (...a: unknown[]) => registerHostListeners(...a),
  cleanupHostListeners: (...a: unknown[]) => cleanupHostListeners(...a),
}))
vi.mock("./startup-hydrate", () => ({
  runStartupLoadSafe: (...a: unknown[]) => runStartupLoadSafe(...a),
  tryMarkStartupHydrated: (...a: unknown[]) => tryMarkStartupHydrated(...a),
}))
vi.mock("../studio-refs", () => ({ studioRefs }))

import { StudioBootstrap } from "./studio-bootstrap"

describe("StudioBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
    tabFromPath.mockReturnValue("image")
    Object.assign(state, {
      selectedGalleryId: "gone",
      gallery: [{ id: "kept", path: "/a.png" }],
      galleryLoaded: true,
      detailReloadToken: 0,
      setDesktop: vi.fn(),
      setStudioTab: vi.fn(),
      setSelectedGalleryId: vi.fn(),
      setStartupHydrated: vi.fn(),
      refreshProviderTokenStatus: vi.fn(async () => {}),
      setHfToken: vi.fn(),
      setHfTokenDirty: vi.fn(),
      setCivitaiToken: vi.fn(),
      setCivitaiTokenDirty: vi.fn(),
    })
    blueprintSession.suppressImagePersist = false
    blueprintSession.detailPrefetch = null
    studioRefs.navigateTab = null
    studioRefs.pushPath = null
  })

  it("hydrates, syncs tab, loads blueprint, settings refresh", async () => {
    const { unmount } = render(
      <StudioBootstrap>
        <span>ok</span>
      </StudioBootstrap>
    )
    await waitFor(() => expect(registerHostListeners).toHaveBeenCalled())
    const getStore = registerHostListeners.mock.calls[0]?.[0] as
      (() => typeof state) | undefined
    expect(getStore?.()).toBe(state)
    expect(runStartupLoadSafe).toHaveBeenCalled()
    expect(applyLoadedBlueprintDetail).toHaveBeenCalled()
    expect(state.setSelectedGalleryId).toHaveBeenCalledWith(null)

    studioRefs.navigateTab?.("video")
    expect(router.push).toHaveBeenCalledWith("/video")
    studioRefs.pushPath?.("/tools")
    expect(router.push).toHaveBeenCalledWith("/tools")

    tabFromPath.mockReturnValue("settings")
    unmount()
    render(
      <StudioBootstrap>
        <span>ok</span>
      </StudioBootstrap>
    )
    await waitFor(() =>
      expect(state.refreshProviderTokenStatus).toHaveBeenCalled()
    )

    blueprintSession.detailPrefetch = {
      id: "bp1",
      promise: Promise.resolve({ id: "bp1", name: "P" }),
    }
    unmount()
    render(
      <StudioBootstrap>
        <span>pref</span>
      </StudioBootstrap>
    )
    await waitFor(() => expect(applyLoadedBlueprintDetail).toHaveBeenCalled())

    getOfficialBlueprint.mockRejectedValueOnce(new Error("detail fail"))
    unmount()
    // force non-prefetch path
    blueprintSession.detailPrefetch = null
    render(
      <StudioBootstrap>
        <span>err</span>
      </StudioBootstrap>
    )
    await waitFor(() => expect(notifyError).toHaveBeenCalled())

    isTauri.mockReturnValue(false)
    unmount()
    render(
      <StudioBootstrap>
        <span>web</span>
      </StudioBootstrap>
    )
    await waitFor(() =>
      expect(state.setStartupHydrated).toHaveBeenCalledWith(true)
    )
    expect(cleanupHostListeners).toHaveBeenCalled()
  })

  it("skips persist, gallery guard, cancel paths, and string errors", async () => {
    blueprintSession.suppressImagePersist = true
    Object.assign(state, {
      selectedGalleryId: null,
      galleryLoaded: false,
      gallery: [],
    })
    render(
      <StudioBootstrap>
        <span>skip</span>
      </StudioBootstrap>
    )
    expect(flushPersistToolsSession).toHaveBeenCalled()
    expect(flushPersistImageSession).not.toHaveBeenCalled()

    Object.assign(state, {
      selectedGalleryId: "keep",
      galleryLoaded: true,
      gallery: [{ id: "keep", path: "/k.png" }],
    })
    const { unmount: u1 } = render(
      <StudioBootstrap>
        <span>keep</span>
      </StudioBootstrap>
    )
    expect(state.setSelectedGalleryId).not.toHaveBeenCalledWith(null)

    let resolveDetail: (v: unknown) => void = () => {}
    getOfficialBlueprint.mockReturnValueOnce(
      new Promise((r) => {
        resolveDetail = r
      })
    )
    blueprintSession.detailPrefetch = null
    const { unmount: u2 } = render(
      <StudioBootstrap>
        <span>cancel-detail</span>
      </StudioBootstrap>
    )
    u2()
    resolveDetail({ id: "bp1" })
    await Promise.resolve()

    getOfficialBlueprint.mockRejectedValueOnce("plain-fail")
    blueprintSession.detailPrefetch = null
    const { unmount: uErr } = render(
      <StudioBootstrap>
        <span>err-str</span>
      </StudioBootstrap>
    )
    uErr()
    await waitFor(() =>
      expect(notifyError).not.toHaveBeenCalledWith("plain-fail")
    )

    tabFromPath.mockReturnValue("settings")
    state.refreshProviderTokenStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 50)
        })
    )
    const { unmount: u3 } = render(
      <StudioBootstrap>
        <span>cancel-settings</span>
      </StudioBootstrap>
    )
    u3()
    await new Promise((r) => setTimeout(r, 60))
    expect(state.setHfToken).not.toHaveBeenCalled()

    getOfficialBlueprint.mockRejectedValueOnce("plain-fail")
    blueprintSession.detailPrefetch = null
    render(
      <StudioBootstrap>
        <span>err-str</span>
      </StudioBootstrap>
    )
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("plain-fail"))
    u1()
  })

  it("renders server snapshot for desktop gate", () => {
    isTauri.mockReturnValue(false)
    expect(
      renderToString(
        <StudioBootstrap>
          <span>ssr</span>
        </StudioBootstrap>
      )
    ).toContain("ssr")
  })
})
