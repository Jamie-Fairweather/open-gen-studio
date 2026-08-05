/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

const { storeApi, previewItem } = vi.hoisted(() => {
  let state: Record<string, unknown> = {}
  const previewItem = {
    current: { id: "g1", path: "/a.png" } as {
      id: string
      path: string
    } | null,
  }
  const storeApi = {
    getState: () => state,
    setState: (partial: Record<string, unknown>) => {
      state = { ...state, ...partial }
    },
    reset: (next: Record<string, unknown>) => {
      state = next
    },
  }
  return { storeApi, previewItem }
})

vi.mock("./store", () => ({
  useStudioStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel(storeApi.getState()),
    {
      getState: () => storeApi.getState(),
      setState: (p: Record<string, unknown>) => storeApi.setState(p),
    }
  ),
  useStudioSelector: (sel: (s: Record<string, unknown>) => unknown) =>
    sel(storeApi.getState()),
}))

vi.mock("./selectors", () => ({
  selectShowAdvancedRail: () => true,
  selectShowGalleryRail: () => true,
  selectStudioLabel: () => "Image",
  selectStageInsetLeft: () => 0,
  selectStageInsetRight: () => 0,
  selectStageDims: () => ({ width: 512, height: 512 }),
  selectPreviewItem: () => previewItem.current,
  selectSelected: () => ({ id: "bp1" }),
  selectAdvancedControls: () => [],
  selectLatestGallerySeed: () => 1,
  selectSupportsLoras: () => true,
  selectActiveArch: () => "z-image",
  selectActiveLoraStack: () => [],
  selectLoraInstallingKey: () => null,
  selectLoraQueuedKeys: () => [],
  selectUpscaleInstallingId: () => null,
  selectUpscaleQueuedIds: () => [],
  selectUpscalePendingIds: () => [],
  selectTabGallery: () => [],
}))

import { useMediaStageProps } from "./use-media-stage-props"
import { useAdvancedRailProps } from "./use-advanced-rail-props"
import { useGalleryRailProps } from "./use-gallery-rail-props"

describe("studio use-*-props", () => {
  beforeEach(() => {
    previewItem.current = { id: "g1", path: "/a.png" }
    storeApi.reset({
      followLive: false,
      livePreviewSrc: null,
      pendingPreviewSrc: null,
      gallerySrc: (p: string) => `asset://${p}`,
      promotePendingPreview: vi.fn(),
      enterFollowLive: vi.fn(),
      SIDE_RAIL_WIDTH: 320,
      studioTab: "image",
      advancedOpen: true,
      galleryOpen: true,
      selectedGalleryId: null,
      controlValues: {},
      setControlValues: vi.fn(),
      setAdvancedOpen: vi.fn(),
      setGalleryOpen: vi.fn(),
      loraPacks: [],
      setLoraStack: vi.fn(),
      setLoraPickerOpen: vi.fn(),
      beginLoraInstall: vi.fn(),
      generating: false,
      isInstalled: vi.fn(),
      upscaleEnabled: false,
      setUpscaleEnabled: vi.fn(),
      upscaleModelId: "",
      setUpscaleModelId: vi.fn(),
      usduEnabled: false,
      setUsduEnabled: vi.fn(),
      usduScale: 2,
      setUsduScale: vi.fn(),
      usduSteps: 8,
      setUsduSteps: vi.fn(),
      usduDenoise: 0.15,
      setUsduDenoise: vi.fn(),
      upscaleModels: [],
      usduReady: false,
      beginUpscaleInstall: vi.fn(),
      beginUsduInstall: vi.fn(),
      selectGalleryItem: vi.fn(),
      handleDeleteGalleryItem: vi.fn(),
      handleCopyGalleryImage: vi.fn(),
      handleRevealGalleryItem: vi.fn(),
      handleReuseGalleryPrompt: vi.fn(),
      handleReuseGallerySettings: vi.fn(),
      openImageToPrompt: vi.fn(),
    })
  })

  it("media stage props branches", () => {
    const { result, rerender } = renderHook(() => useMediaStageProps())
    expect(result.current.stageSrc).toBe("asset:///a.png")
    expect(result.current.showLiveStage).toBe(false)

    act(() => {
      storeApi.setState({
        followLive: true,
        livePreviewSrc: "/live.png",
        pendingPreviewSrc: "/p.png",
      })
    })
    rerender()
    expect(result.current.showLiveStage).toBe(true)
    expect(result.current.stageSrc).toBe("/live.png")
    expect(result.current.showLiveGhost).toBe(true)

    act(() => {
      storeApi.setState({
        followLive: true,
        livePreviewSrc: null,
        pendingPreviewSrc: "/pending.png",
      })
    })
    rerender()
    expect(result.current.stageSrc).toBe("/pending.png")

    act(() => {
      previewItem.current = null
      storeApi.setState({
        followLive: false,
        livePreviewSrc: null,
        pendingPreviewSrc: null,
      })
    })
    rerender()
    expect(result.current.stageSrc).toBeNull()
    expect(result.current.showLiveGhost).toBe(false)

    act(() => {
      result.current.setLightboxOpen(true)
    })
    expect(result.current.lightboxOpen).toBe(true)
  })

  it("advanced and gallery rail props", () => {
    const { result: a } = renderHook(() => useAdvancedRailProps())
    expect(a.current.studioTab).toBe("image")
    expect(a.current.selected).toEqual({ id: "bp1" })

    const { result: g } = renderHook(() => useGalleryRailProps())
    expect(g.current.tabGallery).toEqual([])
    expect(g.current.gallery.open).toBe(true)
  })
})
