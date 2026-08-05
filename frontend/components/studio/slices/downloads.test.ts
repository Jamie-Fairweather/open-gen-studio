import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  pauseDownload: vi.fn(async () => {}),
  resumeDownload: vi.fn(async () => {}),
  cancelDownload: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => vi.clearAllMocks())

describe("createDownloadsSlice", () => {
  it("updates snapshot, clears pending upscales, and proxies pause/resume/cancel", async () => {
    const store = createTestStudioStore()
    store.setState({ pendingUpscaleIds: ["m1", "m2", "other"] })

    store.getState().setDownloadSnapshot({
      active: { jobKey: "upscale:m1" } as never,
      queued: [
        { jobKey: "upscale:m2" } as never,
        { jobKey: "other:x" } as never,
      ],
      history: [],
    })
    expect(store.getState().pendingUpscaleIds).toEqual(["other"])

    store.getState().setDownloadSnapshot((prev) => prev)
    store.getState().setDownloadSpeedBps(123)
    expect(store.getState().downloadSpeedBps).toBe(123)

    await store.getState().pauseDownload("j1")
    await store.getState().resumeDownload("j1")
    await store.getState().cancelDownload("j1")
    expect(host.pauseDownload).toHaveBeenCalledWith("j1")
    expect(host.resumeDownload).toHaveBeenCalledWith("j1")
    expect(host.cancelDownload).toHaveBeenCalledWith("j1")
  })
})
