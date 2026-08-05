import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { studioRefs } from "../studio-refs"

const host = vi.hoisted(() => ({
  setSetting: vi.fn(async () => {}),
  gallerySrc: vi.fn((p: string) => `g://${p}`),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  studioRefs.navigateTab = vi.fn()
  studioRefs.pushPath = vi.fn()
  studioRefs.toolsHandoff = null
})

afterEach(() => vi.useRealTimers())

describe("createUiSlice", () => {
  it("covers navigate, setters, handoff, and queue chip", () => {
    const store = createTestStudioStore()
    const s = store.getState()

    s.navigateTab("video")
    expect(studioRefs.navigateTab).toHaveBeenCalledWith("video")

    s.setDesktop(false)
    s.setStudioTab("audio")
    s.setPickerOpen(true)
    s.setEditBlueprintId("e")
    s.setGpuVendorDialogOpen(true)
    s.setModelsOpen(true)
    s.setLoraPickerOpen(true)
    s.setGalleryOpen(true)
    s.setAdvancedOpen(true)
    s.setQueueExpandOpen(true)
    s.setStartupHydrated(true)
    s.setOnboardingCoverReady(true)
    expect(store.getState().onboardingCoverReady).toBe(true)
    s.setJobQueue([{ jobId: "j" } as never])
    expect(host.setSetting).toHaveBeenCalled()
    host.setSetting.mockRejectedValueOnce(new Error("x"))
    s.setGalleryOpen(false)

    s.setToolsHandoff({ prompt: "hi" })
    expect(studioRefs.toolsHandoff).toEqual({ prompt: "hi" })
    expect(s.consumeToolsHandoff()).toEqual({ prompt: "hi" })
    expect(store.getState().toolsHandoff).toBeNull()
    expect(store.getState().consumeToolsHandoff()).toBeNull()

    s.openImageToPrompt({ prompt: "a" })
    expect(studioRefs.pushPath).toHaveBeenCalledWith("/tools/image-to-prompt")
    s.openImageToPrompt()
    s.openPromptEnhancer({ prompt: "enhance me" })
    expect(store.getState().promptEnhance.input).toBe("enhance me")
    s.openPromptEnhancer({ imagePath: "/x.png" })
    expect(studioRefs.toolsHandoff).toEqual({ imagePath: "/x.png" })
    s.openPromptEnhancer()

    s.acknowledgeQueuedJob("q1")
    expect(store.getState().lastQueuedJobId).toBe("q1")
    s.acknowledgeQueuedJob("q2")
    vi.advanceTimersByTime(2000)
    expect(store.getState().lastQueuedJobId).toBeNull()
    s.acknowledgeQueuedJob("q3")
    store.setState({ lastQueuedJobId: "other" })
    vi.advanceTimersByTime(2000)
    expect(store.getState().lastQueuedJobId).toBe("other")

    expect(s.gallerySrc("p")).toBe("g://p")
    expect(s.SIDE_RAIL_WIDTH).toBeTruthy()
  })
})
