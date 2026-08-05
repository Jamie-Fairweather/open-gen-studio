import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  listJobs: vi.fn(async () => []),
  createJob: vi.fn(async () => ({ id: "j1" })),
  updateJobStatus: vi.fn(async () => ({ id: "j1" })),
  generateImage: vi.fn(async () => ({ id: "j1" })),
  cancelJob: vi.fn(async () => ({ id: "j1" })),
  listJobQueue: vi.fn(async () => ({ items: [] })),
  listJobHistory: vi.fn(async () => []),
  pauseJob: vi.fn(async () => ({ id: "j1" })),
  resumeJob: vi.fn(async () => ({ id: "j1" })),
  reorderJobQueue: vi.fn(async () => ({ items: [] })),
  clearJobQueue: vi.fn(async () => {}),
  deleteJobHistoryItem: vi.fn(async () => {}),
  clearJobHistory: vi.fn(async () => {}),
  freeComfyVram: vi.fn(async () => {}),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  cancelJob,
  clearJobHistory,
  clearJobQueue,
  createJob,
  deleteJobHistoryItem,
  freeComfyVram,
  generateImage,
  listJobHistory,
  listJobQueue,
  listJobs,
  pauseJob,
  reorderJobQueue,
  resumeJob,
  updateJobStatus,
} from "./generate"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("generate host wrappers", () => {
  it("delegates job queue APIs with nullish defaults", async () => {
    await listJobs()
    await createJob("gen")
    expect(commands.createJob).toHaveBeenCalledWith("gen", null)
    await createJob("gen", "{}")
    expect(commands.createJob).toHaveBeenCalledWith("gen", "{}")

    await updateJobStatus("j1", "failed")
    expect(commands.updateJobStatus).toHaveBeenCalledWith("j1", "failed", null)
    await updateJobStatus("j1", "failed", "boom")
    expect(commands.updateJobStatus).toHaveBeenCalledWith(
      "j1",
      "failed",
      "boom"
    )

    await generateImage("bp1", { seed: 1 })
    await cancelJob("j1")
    await listJobQueue()
    await listJobHistory()
    await pauseJob("j1")
    await resumeJob("j1")
    await reorderJobQueue(["a", "b"])
    await clearJobQueue()
    await deleteJobHistoryItem("j1", true)
    await clearJobHistory(false)
    await freeComfyVram()
    expect(commands.freeComfyVram).toHaveBeenCalled()
  })
})
