import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  listUpscalers: vi.fn(async () => [{ id: "u1" }]),
  usduNodeReady: vi.fn(async () => true),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

import { createTestStudioStore } from "@/test/create-test-store"
import {
  finishGenerateJob,
  refreshUpscaleCatalog,
} from "./host-listeners-shared"

beforeEach(() => vi.clearAllMocks())

describe("host-listeners-shared", () => {
  it("finishGenerateJob and refreshUpscaleCatalog", async () => {
    const store = createTestStudioStore()
    store.setState({
      jobQueue: [
        { jobId: "a", kind: "generate" } as never,
        { jobId: "b", kind: "generate" } as never,
      ],
      generating: true,
      activeJobId: "a",
      livePreviewSrc: "x",
    })
    finishGenerateJob(() => store.getState(), "a")
    expect(store.getState().generating).toBe(true)
    expect(store.getState().activeJobId).toBeNull()

    finishGenerateJob(() => store.getState(), "b")
    expect(store.getState().generating).toBe(false)
    expect(store.getState().livePreviewSrc).toBeNull()

    refreshUpscaleCatalog(() => store.getState())
    await vi.waitFor(() =>
      expect(store.getState().upscaleModels).toEqual([{ id: "u1" }])
    )
    expect(store.getState().usduReady).toBe(true)

    host.listUpscalers.mockRejectedValueOnce(new Error("x"))
    host.usduNodeReady.mockRejectedValueOnce(new Error("y"))
    refreshUpscaleCatalog(() => store.getState())
    await Promise.resolve()
  })
})
