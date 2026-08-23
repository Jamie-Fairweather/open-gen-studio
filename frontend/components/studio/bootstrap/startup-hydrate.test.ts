import { beforeEach, describe, expect, it, vi } from "vitest"
import { blueprintSession } from "@/lib/blueprint-session/state"
import { studioRefs } from "../studio-refs"

const host = vi.hoisted(() => ({
  listSettings: vi.fn(async () => ({})),
  listBlueprints: vi.fn(async () => [
    { id: "bp1", category: "image", modelsReady: 1, modelCount: 1 },
  ]),
  listGallery: vi.fn(async () => [{ id: "g1" }]),
  listLoras: vi.fn(async () => [{ id: "l1" }]),
  listUpscalers: vi.fn(async () => [{ id: "4x-nomos2-hq-dat2" }]),
  usduNodeReady: vi.fn(async () => true),
  listRuntimes: vi.fn(async () => []),
  listDownloads: vi.fn(async () => ({
    active: null,
    queued: [],
    history: [],
  })),
  startComfyui: vi.fn(async () => ({
    id: "r1",
    engine: "comfyui",
    status: "starting",
  })),
  comfyuiStatus: vi.fn(async () => ({ healthy: true })),
  detectGpu: vi.fn(async () => ({
    available: false,
    needsVendorChoice: false,
    adapters: [],
  })),
  getOfficialBlueprint: vi.fn(async () => ({ id: "bp1" })),
  setSetting: vi.fn(async () => {}),
  providerTokenStatus: vi.fn(async () => ({
    huggingface: false,
    civitai: false,
  })),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

vi.mock("@/components/studio/store", async () => {
  const { createTestStudioStore } = await import("@/test/create-test-store")
  const store = createTestStudioStore()
  return {
    useStudioStore: Object.assign(
      (sel?: (s: unknown) => unknown) =>
        sel ? sel(store.getState()) : store.getState(),
      {
        getState: () => store.getState(),
        setState: store.setState.bind(store),
        subscribe: store.subscribe.bind(store),
      }
    ),
    __store: store,
  }
})

import { notifyError, notifyInfo } from "@/lib/notify"
import {
  runStartupLoad,
  runStartupLoadSafe,
  tryMarkStartupHydrated,
} from "./startup-hydrate"
import { useStudioStore } from "@/components/studio/store"
import { SETTING_STUDIO_SESSION, SETTING_GPU_VENDOR } from "../slices/helpers"

const router = { replace: vi.fn() } as never

beforeEach(() => {
  vi.clearAllMocks()
  blueprintSession.suppressImagePersist = true
  studioRefs.startupCatalogReady = false
  blueprintSession.pendingSession = null
  blueprintSession.preferredBlueprintId = null
  blueprintSession.detailPrefetch = null
  useStudioStore.setState({
    startupHydrated: false,
    blueprintsLoaded: false,
    galleryLoaded: false,
    blueprints: [],
    gallery: [],
    selectedId: null,
    loraPacks: [],
    upscaleModels: [],
  })
})

describe("startup-hydrate", () => {
  it("tryMarkStartupHydrated gates and runStartupLoad hydrates tiers", async () => {
    tryMarkStartupHydrated()
    useStudioStore.setState({
      startupHydrated: true,
      blueprintsLoaded: true,
      galleryLoaded: true,
    })
    studioRefs.startupCatalogReady = true
    blueprintSession.suppressImagePersist = false
    tryMarkStartupHydrated()

    useStudioStore.setState({ startupHydrated: false })
    tryMarkStartupHydrated()
    useStudioStore.setState({ blueprintsLoaded: false })
    studioRefs.startupCatalogReady = false
    tryMarkStartupHydrated()
    useStudioStore.setState({
      blueprintsLoaded: true,
      galleryLoaded: true,
    })
    studioRefs.startupCatalogReady = true
    blueprintSession.suppressImagePersist = true
    tryMarkStartupHydrated()
    blueprintSession.suppressImagePersist = false
    tryMarkStartupHydrated()
    expect(useStudioStore.getState().startupHydrated).toBe(true)

    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: true,
      galleryLoaded: true,
    })
    studioRefs.startupCatalogReady = true
    blueprintSession.suppressImagePersist = true
    tryMarkStartupHydrated()
    expect(useStudioStore.getState().startupHydrated).toBe(false)
    blueprintSession.suppressImagePersist = false

    useStudioStore.setState({ startupHydrated: false })
    blueprintSession.suppressImagePersist = true
    studioRefs.startupCatalogReady = false

    host.listSettings.mockResolvedValueOnce({
      selected_blueprint_id: "bp1",
      ui_gallery_open: "1",
      ui_advanced_open: "1",
      [SETTING_STUDIO_SESSION]: JSON.stringify({
        v: 1,
        prompt: "restored",
        aspectId: "16:9",
        sideLength: 768,
        controlValues: {},
        loraStack: [
          { id: "l1", strength: 1 },
          { id: "gone", strength: 1 },
        ],
        upscaleEnabled: true,
        upscaleModelId: "missing",
        usduEnabled: true,
        usduScale: 4,
        usduSteps: 9,
        usduDenoise: 0.2,
        selectedGalleryId: "g1",
        followLive: false,
        toolsPath: "/tools/image-to-prompt",
        imageToPrompt: {
          imagePath: null,
          previewUrl: null,
          format: "general",
          target: "auto",
          result: "",
          negative: null,
          fields: null,
          galleryOpen: false,
        },
        promptEnhance: {
          input: "i",
          result: "",
          negative: null,
          target: "auto",
          mode: "expand",
          styleLook: "cinematic",
          seeded: false,
        },
      }),
    })

    await runStartupLoad(router)
    expect(useStudioStore.getState().prompt).toBe("restored")
    expect(router.replace).toHaveBeenCalledWith("/tools/image-to-prompt")
    expect(blueprintSession.detailPrefetch?.id).toBe("bp1")
    // second prefetch same id is no-op
    blueprintSession.detailPrefetch = {
      id: "bp1",
      promise: Promise.resolve({} as never),
    }

    // no session path + gpu vendor branches
    host.listSettings.mockResolvedValueOnce({})
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: false,
      adapters: [{ vendor: "nvidia" }],
    })
    host.listDownloads.mockResolvedValueOnce({
      active: {
        kind: "runtime",
        title: "ComfyUI v1.2.3",
        jobKey: "runtime:comfy",
      },
      queued: [],
      history: [],
    })
    host.listRuntimes.mockResolvedValueOnce([
      { engine: "comfyui", status: "installing", version: "v1.2.3" },
    ])
    studioRefs.startupCatalogReady = false
    blueprintSession.suppressImagePersist = true
    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: false,
      galleryLoaded: false,
    })
    await runStartupLoad(router)
    await vi.waitFor(() => expect(notifyInfo).toHaveBeenCalled())

    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: true,
      adapters: [{ vendor: "nvidia" }, { vendor: "amd" }],
    })
    host.listSettings.mockResolvedValueOnce({})
    host.listDownloads.mockResolvedValueOnce({
      active: null,
      queued: [
        {
          kind: "runtime",
          title: "ComfyUI v9.9.9",
          jobKey: "runtime:comfy",
        },
      ],
      history: [],
    })
    host.listRuntimes.mockResolvedValueOnce([
      { engine: "comfyui", status: "ready", version: "  " },
    ])
    await runStartupLoad(router)
    await vi.waitFor(() =>
      expect(useStudioStore.getState().gpu).toMatchObject({
        needsVendorChoice: true,
      })
    )
    // First-run GPU pick is owned by OnboardingOverlay, not GpuVendorDialog.
    expect(useStudioStore.getState().gpuVendorDialogOpen).toBe(false)

    host.listSettings.mockResolvedValueOnce({})
    host.listLoras.mockRejectedValueOnce(new Error("loras-fail"))
    host.listUpscalers.mockResolvedValueOnce([])
    host.usduNodeReady.mockResolvedValueOnce(false)
    host.listDownloads.mockRejectedValueOnce(new Error("dl"))
    host.listRuntimes.mockRejectedValueOnce(new Error("rt"))
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: false,
      adapters: [],
    })
    await runStartupLoad(router)
    expect(notifyError).toHaveBeenCalled()

    host.listSettings.mockResolvedValueOnce({
      [SETTING_STUDIO_SESSION]: JSON.stringify({
        v: 1,
        prompt: "s2",
        aspectId: "1:1",
        sideLength: 1024,
        controlValues: {},
        loraStack: [],
        upscaleEnabled: false,
        upscaleModelId: "4x-nomos2-hq-dat2",
        usduEnabled: false,
        usduScale: 2,
        usduSteps: 8,
        usduDenoise: 0.15,
        selectedGalleryId: "missing",
        followLive: false,
        toolsPath: null,
        imageToPrompt: {
          imagePath: null,
          previewUrl: null,
          format: "general",
          target: "auto",
          result: "",
          negative: null,
          fields: null,
          galleryOpen: false,
        },
        promptEnhance: {
          input: "",
          result: "",
          negative: null,
          target: "auto",
          mode: "expand",
          styleLook: "cinematic",
          seeded: false,
        },
      }),
    })
    host.listBlueprints.mockResolvedValueOnce([])
    host.listGallery.mockResolvedValueOnce([])
    useStudioStore.setState({
      galleryLoaded: true,
      gallery: [],
      loraPacks: [{ id: "l1" } as never],
      upscaleModels: [{ id: "4x-nomos2-hq-dat2" } as never],
      blueprintsLoaded: true,
      blueprints: [],
    })
    await runStartupLoad(router)

    host.listSettings.mockRejectedValueOnce(new Error("boom"))
    host.listBlueprints.mockResolvedValueOnce([
      { id: "bp1", category: "image" },
    ])
    blueprintSession.detailPrefetch = null
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp1", category: "image" } as never],
      startupHydrated: false,
    })
    await runStartupLoadSafe(router)
    expect(notifyError).toHaveBeenCalled()
    expect(useStudioStore.getState().blueprintsLoaded).toBe(true)
    expect(blueprintSession.detailPrefetch?.id).toBe("bp1")

    // safe path with already selected (skip ensureDetailPrefetch assign)
    host.listSettings.mockRejectedValueOnce(new Error("boom2"))
    useStudioStore.setState({ selectedId: "bp1" })
    await runStartupLoadSafe(router)

    // upscaler/usdu catch fallbacks
    host.listSettings.mockResolvedValue({})
    host.listBlueprints.mockResolvedValue([{ id: "bp1", category: "image" }])
    host.listGallery.mockResolvedValue([])
    host.listLoras.mockResolvedValue([])
    host.listUpscalers.mockRejectedValue(new Error("up-fail"))
    host.usduNodeReady.mockRejectedValue(new Error("usdu-fail"))
    host.listRuntimes.mockResolvedValue([])
    host.listDownloads.mockResolvedValue({
      active: null,
      queued: [],
      history: [],
    })
    host.detectGpu.mockResolvedValue({
      available: false,
      needsVendorChoice: false,
      adapters: [],
    })
    host.comfyuiStatus.mockResolvedValue({ healthy: false })
    studioRefs.startupCatalogReady = false
    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: false,
      galleryLoaded: false,
      upscaleModels: [{ id: "stale" } as never],
      usduReady: true,
    })
    await runStartupLoad(router)
    expect(useStudioStore.getState().upscaleModels).toEqual([])
    expect(useStudioStore.getState().usduReady).toBe(false)

    host.setSetting.mockRejectedValueOnce(new Error("gpu-save"))
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: false,
      adapters: [{ vendor: "nvidia" }],
    })
    host.listSettings.mockResolvedValueOnce({})
    await runStartupLoad(router)

    host.setSetting.mockRejectedValueOnce("gpu-save-str")
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: false,
      adapters: [{ vendor: "amd" }],
    })
    host.listSettings.mockResolvedValueOnce({})
    await runStartupLoad(router)

    host.listSettings.mockResolvedValue({})
    host.listBlueprints.mockResolvedValue([])
    host.listGallery.mockResolvedValue([])
    host.listLoras.mockRejectedValueOnce("loras-str")
    host.listUpscalers.mockResolvedValueOnce([])
    host.usduNodeReady.mockResolvedValueOnce(false)
    studioRefs.startupCatalogReady = false
    useStudioStore.setState({ startupHydrated: false })
    await runStartupLoad(router)
    expect(notifyError).toHaveBeenCalledWith("loras-str")

    blueprintSession.detailPrefetch = {
      id: "bp1",
      promise: Promise.resolve({ id: "bp1" } as never),
    }
    host.listSettings.mockRejectedValueOnce(new Error("safe-prefetch"))
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp1", category: "image" } as never],
    })
    await runStartupLoadSafe(router)
    expect(blueprintSession.detailPrefetch?.id).toBe("bp1")

    host.listSettings.mockRejectedValueOnce("safe-str")
    blueprintSession.detailPrefetch = null
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp1", category: "image" } as never],
    })
    await runStartupLoadSafe(router)
    host.listSettings.mockResolvedValueOnce({
      [SETTING_STUDIO_SESSION]: JSON.stringify({
        v: 1,
        prompt: "no-gallery",
        aspectId: "1:1",
        sideLength: 1024,
        controlValues: {},
        loraStack: [],
        upscaleEnabled: false,
        upscaleModelId: null,
        usduEnabled: false,
        usduScale: 2,
        usduSteps: 8,
        usduDenoise: 0.15,
        selectedGalleryId: "g1",
        followLive: false,
        toolsPath: null,
        imageToPrompt: {
          imagePath: null,
          previewUrl: null,
          format: "general",
          target: "auto",
          result: "",
          negative: null,
          fields: null,
          galleryOpen: false,
        },
        promptEnhance: {
          input: "",
          result: "",
          negative: null,
          target: "auto",
          mode: "expand",
          styleLook: "cinematic",
          seeded: false,
        },
      }),
    })
    useStudioStore.setState({ galleryLoaded: false, gallery: [] })
    await runStartupLoad(router)

    host.setSetting.mockResolvedValueOnce(undefined)
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      needsVendorChoice: true,
      adapters: [{ vendor: "nvidia" }],
    })
    host.listSettings.mockResolvedValueOnce({ [SETTING_GPU_VENDOR]: "nvidia" })
    useStudioStore.setState({ gpuVendorDialogOpen: false })
    await runStartupLoad(router)
    expect(useStudioStore.getState().gpuVendorDialogOpen).toBe(false)

    host.listSettings.mockRejectedValueOnce(new Error("safe-null-id"))
    blueprintSession.detailPrefetch = null
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp-video", category: "video" } as never],
    })
    await runStartupLoadSafe(router)

    blueprintSession.detailPrefetch = {
      id: "bp1",
      promise: Promise.resolve({ id: "bp1" } as never),
    }
    host.listSettings.mockRejectedValueOnce(new Error("safe-skip-prefetch"))
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp1", category: "image" } as never],
    })
    await runStartupLoadSafe(router)

    expect(notifyError).toHaveBeenCalledWith("safe-str")
  })

  it("auto-starts ComfyUI when installed and idle", async () => {
    host.listSettings.mockResolvedValue({})
    host.listBlueprints.mockResolvedValue([])
    host.listGallery.mockResolvedValue([])
    host.listLoras.mockResolvedValue([])
    host.listUpscalers.mockResolvedValue([])
    host.usduNodeReady.mockResolvedValue(false)
    host.listRuntimes.mockResolvedValue([
      {
        id: "r1",
        engine: "comfyui",
        status: "ready",
        installPath: "C:/comfy",
        version: "v1",
      },
    ])
    host.listDownloads.mockResolvedValue({
      active: null,
      queued: [],
      history: [],
    })
    host.detectGpu.mockResolvedValue({
      available: false,
      needsVendorChoice: false,
      adapters: [],
    })
    host.comfyuiStatus.mockResolvedValue({ healthy: false })
    studioRefs.startupCatalogReady = false
    blueprintSession.suppressImagePersist = true
    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: false,
      galleryLoaded: false,
      runtimes: [],
      downloadSnapshot: { active: null, queued: [], history: [] },
    })
    await runStartupLoad(router, () => useStudioStore.getState())
    await vi.waitFor(() => expect(host.startComfyui).toHaveBeenCalled())
  })

  it("marks runtime busy from queued runtime download jobs", async () => {
    vi.mocked(notifyInfo).mockClear()
    const snap = {
      active: { kind: "blueprint", title: "other", jobKey: "blueprint:x" },
      queued: [
        { kind: "runtime", title: "ComfyUI v3.0.0", jobKey: "runtime:comfy" },
      ],
      history: [],
    }
    host.listSettings.mockResolvedValue({})
    host.listBlueprints.mockResolvedValue([])
    host.listGallery.mockResolvedValue([])
    host.listLoras.mockResolvedValue([])
    host.listUpscalers.mockResolvedValue([])
    host.usduNodeReady.mockResolvedValue(false)
    host.listRuntimes.mockImplementation(async () => [
      { engine: "comfyui", status: "ready", version: "" },
    ])
    host.listDownloads.mockImplementation(async () => snap)
    host.detectGpu.mockResolvedValue({
      available: false,
      needsVendorChoice: false,
      adapters: [],
    })
    host.comfyuiStatus.mockResolvedValue({ healthy: false })
    studioRefs.startupCatalogReady = false
    blueprintSession.suppressImagePersist = true
    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: false,
      galleryLoaded: false,
      runtimeBusy: false,
      runtimeMessage: null,
    })
    const load = runStartupLoad(router, () => useStudioStore.getState())
    await load
    expect(host.listDownloads).toHaveBeenCalled()
    expect(host.listRuntimes).toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(useStudioStore.getState().runtimeBusy).toBe(true)
    )
    expect(useStudioStore.getState().runtimeMessage).toBe(
      "Installing ComfyUI in the background…"
    )
    expect(notifyInfo).toHaveBeenCalled()
  })

  it("runStartupLoadSafe ensureDetailPrefetch guards and no-version notify", async () => {
    host.listSettings.mockRejectedValueOnce(new Error("safe-null-prefetch"))
    host.listBlueprints.mockResolvedValueOnce([
      { id: "bp-video", category: "video" },
    ])
    host.listGallery.mockResolvedValueOnce([])
    blueprintSession.detailPrefetch = null
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp-video", category: "video" } as never],
      startupHydrated: false,
    })
    await runStartupLoadSafe(router)

    blueprintSession.detailPrefetch = {
      id: "bp1",
      promise: Promise.resolve({ id: "bp1" } as never),
    }
    host.listSettings.mockRejectedValueOnce(new Error("safe-skip-prefetch"))
    host.listBlueprints.mockResolvedValueOnce([
      { id: "bp1", category: "image" },
    ])
    host.listGallery.mockResolvedValueOnce([])
    useStudioStore.setState({
      selectedId: null,
      blueprints: [{ id: "bp1", category: "image" } as never],
    })
    const before = blueprintSession.detailPrefetch
    await runStartupLoadSafe(router)
    expect(blueprintSession.detailPrefetch).toBe(before)

    vi.mocked(notifyInfo).mockClear()
    const snap = {
      active: { kind: "runtime", title: "Installing", jobKey: "runtime:comfy" },
      queued: [] as { kind: string; title: string; jobKey: string }[],
      history: [],
    }
    host.listSettings.mockResolvedValue({})
    host.listBlueprints.mockResolvedValue([])
    host.listGallery.mockResolvedValue([])
    host.listLoras.mockResolvedValue([])
    host.listUpscalers.mockResolvedValue([])
    host.usduNodeReady.mockResolvedValue(false)
    host.listRuntimes.mockImplementation(async () => [
      { engine: "comfyui", status: "ready", version: "" },
    ])
    host.listDownloads.mockImplementation(async () => snap)
    host.detectGpu.mockResolvedValue({
      available: false,
      needsVendorChoice: false,
      adapters: [],
    })
    host.comfyuiStatus.mockResolvedValue({ healthy: false })
    studioRefs.startupCatalogReady = false
    useStudioStore.setState({
      startupHydrated: false,
      blueprintsLoaded: false,
      galleryLoaded: false,
      runtimeBusy: false,
    })
    await runStartupLoad(router)
    await vi.waitFor(() => expect(notifyInfo).toHaveBeenCalled())
    expect(notifyInfo).toHaveBeenCalledWith(
      "Installing Runtime",
      "Installing ComfyUI…",
      "runtime-install"
    )
  })
})
