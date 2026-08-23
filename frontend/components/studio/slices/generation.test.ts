import { beforeEach, describe, expect, it, vi } from "vitest"
import { studioRefs } from "../studio-refs"

const host = vi.hoisted(() => ({
  gallerySrc: vi.fn((p: string) => `asset://${p}`),
  generateImage: vi.fn(async () => ({ id: "newjob" })),
  cancelJob: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

vi.mock("./session-persist", () => ({
  flushPersistImageSession: vi.fn(),
  schedulePersistImageSession: vi.fn(),
}))

import { notifyError, notifyInfo } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

function readyBp(partial: Record<string, unknown> = {}) {
  return {
    id: "bp1",
    category: "image",
    modelsReady: 1,
    modelCount: 1,
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  studioRefs.livePreviewSrc = null
  studioRefs.pendingPreviewSrc = null
})

describe("createGenerationSlice", () => {
  it("preview helpers, generate gates, cancel, and setters", async () => {
    const store = createTestStudioStore()
    let s = store.getState()

    s.applySize("16:9", 1280)
    expect(store.getState().controlValues).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    })

    s.queueLivePreview("/a.png")
    expect(store.getState().livePreviewSrc).toContain("asset://")
    studioRefs.livePreviewSrc = store.getState().livePreviewSrc
    store.setState({ followLive: true })
    store.getState().queueLivePreview("/b.png")
    expect(store.getState().pendingPreviewSrc).toContain("asset://")
    const pending = store.getState().pendingPreviewSrc!
    store.getState().promotePendingPreview(pending)
    expect(store.getState().pendingPreviewSrc).toBeNull()
    store.getState().promotePendingPreview("other")
    store.getState().clearLivePreview()
    store.getState().enterFollowLive()

    await store.getState().handleGenerate()
    expect(notifyInfo).toHaveBeenCalled()

    store.setState({ blueprintsLoaded: true, blueprints: [], selectedId: null })
    await store.getState().handleGenerate()
    expect(store.getState().pickerOpen).toBe(true)

    store.setState({
      blueprints: [readyBp({ modelsReady: 0, modelCount: 2 }) as never],
      selectedId: "bp1",
      pickerOpen: false,
    })
    await store.getState().handleGenerate()
    expect(notifyInfo).toHaveBeenCalled()

    store.setState({
      blueprints: [readyBp() as never],
      prompt: "  ",
      pickerOpen: false,
    })
    await store.getState().handleGenerate()
    expect(notifyInfo).toHaveBeenCalled()

    store.setState({
      blueprints: [readyBp() as never],
      prompt: "cat",
      detail: null,
      generating: false,
      jobQueue: [],
    })
    await store.getState().handleGenerate()
    expect(host.generateImage).toHaveBeenCalled()

    store.setState({
      detail: { id: "bp1", arch: "flux", controls: [] } as never,
    })
    await store.getState().handleGenerate()
    expect(host.generateImage).toHaveBeenCalledTimes(2)
    expect(store.getState().activeJobId).toBe("newjob")

    store.setState({
      blueprints: [readyBp({ modelCount: 0, modelsReady: 0 }) as never],
      prompt: "cat",
      pickerOpen: false,
    })
    await store.getState().handleGenerate()
    expect(host.generateImage).toHaveBeenCalledTimes(3)

    store.setState({
      blueprints: [
        readyBp({ modelsReady: undefined, modelCount: undefined }) as never,
      ],
      selectedId: "bp1",
      prompt: "cat",
      pickerOpen: false,
    })
    await store.getState().handleGenerate()
    expect(host.generateImage).toHaveBeenCalledTimes(3)

    store.setState({
      blueprints: [readyBp() as never],
      prompt: "cat",
      detail: { id: "bp1", arch: "flux", controls: [] } as never,
      generating: false,
      jobQueue: [],
      activeJobId: "prev",
    })
    host.generateImage.mockRejectedValueOnce(new Error("gen"))
    await store.getState().handleGenerate()
    expect(store.getState().activeJobId).toBeNull()

    store.setState({
      generating: true,
      activeJobId: "run1",
      jobQueue: [{ status: "running", jobId: "run1" } as never],
      followLive: false,
    })
    host.generateImage.mockRejectedValueOnce("plain-gen")
    await store.getState().handleGenerate()
    expect(notifyError).toHaveBeenCalledWith("plain-gen", "Generation failed")
    expect(store.getState().activeJobId).toBe("run1")

    store.setState({
      jobQueue: [{ status: "running", jobId: "run-cancel" } as never],
      activeJobId: "other-id",
    })
    await store.getState().handleCancel()
    expect(host.cancelJob).toHaveBeenCalledWith("run-cancel")

    store.setState({
      jobQueue: [],
      activeJobId: null,
    })
    await store.getState().handleCancel()

    await store.getState().handleCancel()
    store.setState({
      jobQueue: [],
      activeJobId: "x",
    })
    host.cancelJob.mockRejectedValueOnce(new Error("cancel"))
    await store.getState().handleCancel()
    store.setState({ activeJobId: "y" })
    host.cancelJob.mockRejectedValueOnce("c")
    await store.getState().handleCancel()

    s = store.getState()
    s.setPrompt("p")
    s.setControlValues({ a: 1 })
    s.setGenerating(true)
    s.setActiveJobId("j")
    s.setGenStep({ jobId: "j", step: 1, max: 2 })
    s.setAspectId("1:1")
    s.setSideLength(512)
    store.setState({ followLive: false, livePreviewSrc: null })
    studioRefs.livePreviewSrc = null
    store.getState().queueLivePreview("/c.png")
  })
})
