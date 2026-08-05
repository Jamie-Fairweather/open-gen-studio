import { beforeEach, describe, expect, it, vi } from "vitest"

const cbs = vi.hoisted(() => {
  const make = () => {
    let cb: ((...args: unknown[]) => void) | null = null
    return {
      on: vi.fn(async (fn: (...args: unknown[]) => void) => {
        cb = fn
        return () => {
          cb = null
        }
      }),
      emit: (...args: unknown[]) => cb?.(...args),
      get: () => cb,
    }
  }
  return {
    probe: make(),
    sizes: make(),
    bpProgress: make(),
    bpUpdated: make(),
    dlManager: make(),
    dlProgress: make(),
    runtimes: make(),
    rtProgress: make(),
    jobs: make(),
    jobProgress: make(),
    jobQueue: make(),
    gallery: make(),
    galleryDel: make(),
    loras: make(),
    loraProgress: make(),
    upscalers: make(),
    upscaleProgress: make(),
    promptTools: make(),
    listBlueprints: vi.fn(async () => [{ id: "bp1" }]),
    listLoras: vi.fn(async () => [{ id: "l1" }]),
    listUpscalers: vi.fn(async () => [{ id: "u1" }]),
    usduNodeReady: vi.fn(async () => true),
    listJobQueue: vi.fn(async () => ({ items: [] })),
  }
})

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    onBlueprintProbe: cbs.probe.on,
    onBlueprintSizes: cbs.sizes.on,
    onBlueprintProgress: cbs.bpProgress.on,
    onBlueprintsUpdated: cbs.bpUpdated.on,
    onDownloadManager: cbs.dlManager.on,
    onDownloadProgress: cbs.dlProgress.on,
    onRuntimesUpdated: cbs.runtimes.on,
    onRuntimeProgress: cbs.rtProgress.on,
    onJobsUpdated: cbs.jobs.on,
    onJobProgress: cbs.jobProgress.on,
    onJobQueue: cbs.jobQueue.on,
    onGalleryUpdated: cbs.gallery.on,
    onGalleryDeleted: cbs.galleryDel.on,
    onLorasUpdated: cbs.loras.on,
    onLoraProgress: cbs.loraProgress.on,
    onUpscalersUpdated: cbs.upscalers.on,
    onUpscaleProgress: cbs.upscaleProgress.on,
    onPromptToolsProgress: cbs.promptTools.on,
    listBlueprints: cbs.listBlueprints,
    listLoras: cbs.listLoras,
    listUpscalers: cbs.listUpscalers,
    usduNodeReady: cbs.usduNodeReady,
    listJobQueue: cbs.listJobQueue,
  })
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

vi.mock("@/lib/download-thresholds", () => ({
  MIN_ETA_SPEED_BPS: 1,
}))

vi.mock("@/components/studio/store", async () => {
  const { createTestStudioStore } = await import("@/test/create-test-store")
  const store = createTestStudioStore()
  return {
    useStudioStore: Object.assign(() => store.getState(), {
      getState: () => store.getState(),
      setState: store.setState.bind(store),
    }),
  }
})

import {
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"
import { cleanupHostListeners, registerHostListeners } from "./host-listeners"
import { studioRefs } from "../studio-refs"
import { useStudioStore } from "@/components/studio/store"

beforeEach(() => {
  vi.clearAllMocks()
  studioRefs.preferredBlueprintId = null
})

describe("registerHostListeners", () => {
  it("wires all listeners and cleanup", async () => {
    const store = createTestStudioStore()
    const getStore = () => store.getState()
    const handles = registerHostListeners(getStore)
    await vi.waitFor(() => expect(cbs.probe.get()).toBeTruthy())

    cbs.probe.emit({ stage: "start" })
    expect(store.getState().sizesProbing).toBe(true)
    cbs.sizes.emit([{ id: "bp1", category: "image" }])
    expect(store.getState().blueprints).toHaveLength(1)
    cbs.bpProgress.emit({ stage: "done", message: "ok" })
    cbs.bpProgress.emit({ stage: "error", message: "e" })
    cbs.bpProgress.emit({ stage: "cancelled" })
    cbs.bpProgress.emit({ stage: "download", message: "dl" })
    expect(notifyDismiss).toHaveBeenCalled()
    cbs.bpUpdated.emit()
    await vi.waitFor(() => expect(cbs.listBlueprints).toHaveBeenCalled())
    cbs.listBlueprints.mockRejectedValueOnce(new Error("bp"))
    cbs.bpUpdated.emit()
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalled())
    cbs.listBlueprints.mockRejectedValueOnce("bp-str")
    cbs.bpUpdated.emit()
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith("bp-str"))

    cbs.dlManager.emit({ active: null, queued: [], history: [] })
    const perf = vi.spyOn(performance, "now")
    perf.mockReturnValueOnce(0)
    cbs.dlProgress.emit({
      downloaded: 0,
      total: 1_000_000,
      done: false,
      url: "https://a/file",
    })
    perf.mockReturnValueOnce(6_000)
    cbs.dlProgress.emit({
      downloaded: 500_000,
      total: 1_000_000,
      done: false,
      url: "https://a/file",
    })
    expect(store.getState().runtimeMessage).toContain("ETA")
    cbs.dlProgress.emit({
      downloaded: 100,
      total: 100,
      done: true,
      url: "https://a/file",
    })
    cbs.dlProgress.emit({
      downloaded: 10,
      total: null,
      done: false,
      url: "https://a/file",
    })
    perf.mockRestore()

    const rt = {
      id: "r1",
      engine: "comfyui",
      status: "installing",
      error: null,
    }
    cbs.runtimes.emit(rt)
    expect(store.getState().runtimeBusy).toBe(true)
    cbs.runtimes.emit({ ...rt, status: "ready" })
    cbs.runtimes.emit({ ...rt, status: "running" })
    cbs.runtimes.emit({ ...rt, status: "error", error: "boom" })
    store.setState({
      downloadSnapshot: {
        active: { kind: "runtime" } as never,
        queued: [],
        history: [],
      },
    })
    cbs.runtimes.emit({ ...rt, id: "r2", status: "ready" })

    cbs.rtProgress.emit({ stage: "download", message: "d" })
    cbs.rtProgress.emit({ stage: "done", message: "ok" })
    cbs.rtProgress.emit({ stage: "ready", message: "r" })
    cbs.rtProgress.emit({ stage: "error", message: "e" })
    cbs.rtProgress.emit({ stage: "start", message: "s" })

    cbs.jobs.emit({
      id: "j1",
      kind: "generate",
      status: "failed",
      error: "x",
    })
    cbs.jobs.emit({ id: "j2", kind: "generate", status: "cancelled" })
    cbs.jobs.emit({ id: "j3", kind: "other", status: "completed" })
    expect(store.getState().jobQueue).toEqual([])
    store.setState({ jobQueue: [{ jobId: "j3", kind: "other" } as never] })
    cbs.jobs.emit({ id: "j3", kind: "other", status: "failed" })
    expect(store.getState().jobQueue).toEqual([])
    cbs.jobs.emit({ id: "j4", kind: "generate", status: "running" })

    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        jobId: "tool",
      },
    })
    expect(
      cbs.jobProgress.emit({
        jobId: "tool",
        stage: "run",
        message: "m",
      })
    ).toBeUndefined()

    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: null },
    })
    cbs.jobProgress.emit({ stage: "step", jobId: "g", step: 1, max: 2 })
    cbs.jobProgress.emit({ stage: "step", jobId: "g", step: null, max: 2 })
    cbs.jobProgress.emit({ stage: "preview", previewPath: "/p.png" })
    cbs.jobProgress.emit({ stage: "preview" })
    cbs.jobProgress.emit({ stage: "done", jobId: "g" })
    cbs.jobProgress.emit({ stage: "cancelled", jobId: "g", message: "c" })
    cbs.jobProgress.emit({ stage: "error", jobId: "g", message: "e" })
    cbs.jobProgress.emit({ stage: "start", message: "s" })
    cbs.jobProgress.emit({ stage: "run", message: "m" })

    cbs.jobQueue.emit({
      items: [{ kind: "generate", status: "running", jobId: "run" }],
    })
    expect(store.getState().activeJobId).toBe("run")
    cbs.jobQueue.emit({
      items: [{ kind: "generate", status: "queued", jobId: "q" }],
    })
    cbs.jobQueue.emit({ items: [] })
    cbs.listJobQueue.mockRejectedValueOnce(new Error("q"))

    const gItem = {
      id: "g1",
      path: "a.png",
      jobId: null,
      thumbnailPath: null,
      metadataJson: "{}",
      createdAt: 0,
    }
    cbs.gallery.emit(gItem)
    expect(store.getState().gallery[0].id).toBe("g1")
    cbs.gallery.emit({ ...gItem, path: "b.png" })
    store.setState({ selectedGalleryId: "g1" })
    cbs.galleryDel.emit("g1")
    expect(store.getState().selectedGalleryId).toBeNull()
    cbs.galleryDel.emit("missing")

    cbs.loras.emit()
    await vi.waitFor(() => expect(cbs.listLoras).toHaveBeenCalled())
    cbs.listLoras.mockRejectedValueOnce(new Error("l"))
    cbs.loras.emit()
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalled())
    cbs.listLoras.mockRejectedValueOnce("l-str")
    cbs.loras.emit()
    await vi.waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("l-str", "LoRAs")
    )

    cbs.upscalers.emit()
    store.setState({
      downloadSnapshot: { active: null, queued: [], history: [] },
      runtimes: [{ engine: "other", status: "ready" } as never],
    })
    cbs.upscaleProgress.emit({
      stage: "done",
      modelId: "usdu",
      message: "m",
    })
    cbs.upscaleProgress.emit({ stage: "done", modelId: "supir" })
    cbs.upscaleProgress.emit({ stage: "done", modelId: "supir-weights" })
    cbs.upscaleProgress.emit({ stage: "done", modelId: "other" })
    cbs.upscaleProgress.emit({ stage: "error", message: "e" })
    cbs.upscaleProgress.emit({ stage: "progress", message: "p" })
    store.setState({
      downloadSnapshot: { active: null, queued: [], history: [] },
      runtimes: [{ engine: "comfyui", status: "installing" } as never],
    })
    cbs.upscaleProgress.emit({
      stage: "done",
      modelId: "x",
      message: "runtime msg",
    })
    expect(notifySuccess).not.toHaveBeenCalledWith(
      "Upscale model ready",
      expect.anything()
    )
    expect(store.getState().runtimeMessage).toBe("runtime msg")
    store.setState({
      downloadSnapshot: {
        active: { kind: "runtime" } as never,
        queued: [],
        history: [],
      },
      runtimes: [],
    })
    cbs.upscaleProgress.emit({
      stage: "done",
      modelId: "y",
      message: "via-active",
    })

    cbs.promptTools.emit({ message: "pt", stage: "run" })
    cbs.promptTools.emit({ stage: "error" })
    cbs.promptTools.emit({ message: "e", stage: "error" })

    cbs.loraProgress.emit({ stage: "error", message: "e" })
    cbs.loraProgress.emit({ stage: "progress", message: "p" })
    cbs.loraProgress.emit({ stage: "done", loraId: "l", arch: "flux" })
    cbs.listLoras.mockRejectedValueOnce(new Error("x"))
    cbs.loraProgress.emit({ stage: "done", loraId: "l", arch: "flux" })
    await Promise.resolve()

    cleanupHostListeners(handles)
    cleanupHostListeners({})
    expect(notifySuccess).toHaveBeenCalled()
    expect(notifyInfo).toHaveBeenCalled()

    // default getStore path (uses mocked useStudioStore)
    const handles2 = registerHostListeners()
    await vi.waitFor(() => expect(cbs.gallery.get()).toBeTruthy())
    cbs.gallery.emit({
      id: "gx",
      path: "x.png",
      jobId: null,
      thumbnailPath: null,
      metadataJson: "{}",
      createdAt: 0,
    })
    expect(useStudioStore.getState().gallery.some((g) => g.id === "gx")).toBe(
      true
    )
    cleanupHostListeners(handles2)
  })
})
