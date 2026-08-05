/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { JobQueueItem } from "@/lib/host"

const clearJobQueue = vi.fn(async () => {})
const reorderJobQueue = vi.fn(async () => {})
const notifyError = vi.fn()
const notifySuccess = vi.fn()

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    clearJobQueue: (...a: unknown[]) => clearJobQueue(...a),
    reorderJobQueue: (...a: unknown[]) => reorderJobQueue(...a),
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}))

vi.mock(
  "@/components/studio/slices/session-persist",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/studio/slices/session-persist")
      >()
    return { ...actual, bindSessionPersist: vi.fn() }
  }
)

import { useStudioStore } from "@/components/studio/store"
import { runningStepLabel, useJobQueueActions } from "./use-job-queue-actions"

const q = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "G",
  status: "queued",
  prompt: null,
  meta: null,
  ...partial,
})

describe("runningStepLabel", () => {
  it("returns step label only for matching generate run", () => {
    expect(runningStepLabel([], null)).toBeNull()
    expect(
      runningStepLabel(
        [q({ status: "running", kind: "generate", jobId: "r1" })],
        { jobId: "r1", step: 2, max: 10 }
      )
    ).toBe("2/10")
    expect(
      runningStepLabel(
        [q({ status: "running", kind: "prompt-tool", jobId: "r1" })],
        { jobId: "r1", step: 2, max: 10 }
      )
    ).toBeNull()
    expect(
      runningStepLabel(
        [q({ status: "running", kind: "generate", jobId: "r1" })],
        { jobId: "other", step: 2, max: 10 }
      )
    ).toBeNull()
    expect(
      runningStepLabel(
        [q({ status: "running", kind: "generate", jobId: "r1" })],
        { jobId: "r1", step: 2, max: 0 }
      )
    ).toBeNull()
  })
})

describe("useJobQueueActions", () => {
  beforeEach(() => {
    clearJobQueue.mockReset().mockResolvedValue(undefined)
    reorderJobQueue.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
    notifySuccess.mockReset()
    useStudioStore.setState({
      jobQueue: [
        q({ jobId: "run", status: "running" }),
        q({ jobId: "a", status: "queued", label: "A" }),
        q({ jobId: "b", status: "queued", label: "B" }),
      ],
      generating: true,
      activeJobId: "run",
    })
  })

  it("clearQueue resets local state and notifies", async () => {
    const { result } = renderHook(() => useJobQueueActions())
    await act(async () => {
      result.current.clearQueue()
      await Promise.resolve()
    })
    expect(useStudioStore.getState().jobQueue).toEqual([])
    expect(useStudioStore.getState().generating).toBe(false)
    expect(useStudioStore.getState().activeJobId).toBeNull()
    expect(notifySuccess).toHaveBeenCalledWith("Queue cleared")

    clearJobQueue.mockRejectedValueOnce(new Error("boom"))
    await act(async () => {
      result.current.clearQueue()
      await Promise.resolve()
    })
    expect(notifyError).toHaveBeenCalledWith("boom")

    clearJobQueue.mockRejectedValueOnce("raw")
    await act(async () => {
      result.current.clearQueue()
      await Promise.resolve()
    })
    expect(notifyError).toHaveBeenCalledWith("raw")
  })

  it("reorderWaiting moves queued items and handles early exits", async () => {
    const { result } = renderHook(() => useJobQueueActions())
    act(() => {
      result.current.reorderWaiting({
        active: { id: "a" },
        over: null,
      } as never)
      result.current.reorderWaiting({
        active: { id: "a" },
        over: { id: "a" },
      } as never)
      result.current.reorderWaiting({
        active: { id: "missing" },
        over: { id: "b" },
      } as never)
    })
    expect(reorderJobQueue).not.toHaveBeenCalled()

    await act(async () => {
      result.current.reorderWaiting({
        active: { id: "a" },
        over: { id: "b" },
      } as never)
      await Promise.resolve()
    })
    expect(useStudioStore.getState().jobQueue.map((i) => i.jobId)).toEqual([
      "run",
      "b",
      "a",
    ])
    expect(reorderJobQueue).toHaveBeenCalledWith(["b", "a"])

    reorderJobQueue.mockRejectedValueOnce(new Error("nope"))
    await act(async () => {
      result.current.reorderWaiting({
        active: { id: "b" },
        over: { id: "a" },
      } as never)
      await Promise.resolve()
    })
    expect(notifyError).toHaveBeenCalledWith("nope")

    reorderJobQueue.mockRejectedValueOnce(9)
    await act(async () => {
      result.current.reorderWaiting({
        active: { id: "a" },
        over: { id: "b" },
      } as never)
      await Promise.resolve()
    })
    expect(notifyError).toHaveBeenCalledWith("9")
  })
})
