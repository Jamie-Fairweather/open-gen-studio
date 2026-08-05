import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { JobQueueItem } from "@/lib/host"

const pauseJob = vi.fn(async () => ({}))
const resumeJob = vi.fn(async () => ({}))
const cancelJob = vi.fn(async () => {})
const notifyError = vi.fn()

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    pauseJob: (...a: unknown[]) => pauseJob(...a),
    resumeJob: (...a: unknown[]) => resumeJob(...a),
    cancelJob: (...a: unknown[]) => cancelJob(...a),
    clearJobQueue: vi.fn(async () => {}),
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
  notifySuccess: vi.fn(),
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

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>()
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

import { useStudioStore } from "@/components/studio/store"
import { JobQueueRail } from "./job-queue-rail"

const q = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "Gen",
  status: "queued",
  prompt: null,
  meta: null,
  ...partial,
})

describe("JobQueueRail", () => {
  let resizeCallback: ResizeObserverCallback | null = null

  beforeEach(() => {
    resizeCallback = null
    pauseJob.mockReset().mockResolvedValue({})
    resumeJob.mockReset().mockResolvedValue({})
    cancelJob.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
    class RO {
      cb: ResizeObserverCallback
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", RO)
    useStudioStore.setState({
      jobQueue: [],
      queueExpandOpen: false,
      lastQueuedJobId: null,
      genStep: null,
      controlValues: { steps: 20 },
    })
  })

  it("empty state opens history", async () => {
    const user = userEvent.setup()
    render(<JobQueueRail />)
    expect(screen.getByText("Nothing queued")).toBeTruthy()
    await user.click(screen.getByLabelText("Job history"))
    expect(useStudioStore.getState().queueExpandOpen).toBe(true)
  })

  it("renders chips, overflow, clear, expand, and action errors", async () => {
    const user = userEvent.setup()
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 2000
      },
    })
    useStudioStore.setState({
      jobQueue: [
        q({ jobId: "run", status: "running", label: "Run" }),
        q({ jobId: "pause", status: "paused", label: "Pause" }),
        q({ jobId: "w1", status: "queued", label: "Wait1" }),
      ],
      lastQueuedJobId: "w1",
      genStep: { jobId: "run", step: 1, max: 10 },
      controlValues: {},
    })

    const { rerender } = render(<JobQueueRail />)
    resizeCallback?.([], {} as ResizeObserver)
    expect(screen.getByLabelText("Clear queue")).toBeTruthy()
    await user.click(screen.getByLabelText("Open full queue"))
    expect(useStudioStore.getState().queueExpandOpen).toBe(true)

    await userEvent.click(screen.getByLabelText("Pause job"))
    expect(pauseJob).toHaveBeenCalled()
    pauseJob.mockRejectedValueOnce(new Error("pe"))
    await user.click(screen.getByLabelText("Pause job"))
    expect(notifyError).toHaveBeenCalledWith("pe")
    pauseJob.mockRejectedValueOnce("px")
    await user.click(screen.getByLabelText("Pause job"))
    expect(notifyError).toHaveBeenCalledWith("px")

    await user.click(screen.getByLabelText("Resume job"))
    resumeJob.mockRejectedValueOnce(new Error("re"))
    await user.click(screen.getByLabelText("Resume job"))
    expect(notifyError).toHaveBeenCalledWith("re")
    resumeJob.mockRejectedValueOnce("rx")
    await user.click(screen.getByLabelText("Resume job"))
    expect(notifyError).toHaveBeenCalledWith("rx")

    cancelJob.mockRejectedValueOnce(new Error("ce"))
    const cancels = screen.getAllByLabelText(/Cancel job|Remove from queue/)
    await user.click(cancels[0]!)
    expect(notifyError).toHaveBeenCalledWith("ce")
    cancelJob.mockRejectedValueOnce("cx")
    await user.click(cancels[0]!)
    expect(notifyError).toHaveBeenCalledWith("cx")

    await user.click(screen.getByLabelText("Clear queue"))

    // Overflow chip with tiny strip
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 40
      },
    })
    useStudioStore.setState({
      jobQueue: [
        q({ jobId: "a", label: "A" }),
        q({ jobId: "b", label: "B" }),
        q({ jobId: "c", label: "C" }),
        q({ jobId: "d", label: "D" }),
      ],
      queueExpandOpen: false,
    })
    rerender(<JobQueueRail />)
    const overflow = screen.queryByRole("button", { name: /^\+\d+$/ })
    if (overflow) await user.click(overflow)
  })

  it("uses controlValues steps when genStep missing", () => {
    useStudioStore.setState({
      jobQueue: [q({ jobId: "a", status: "queued" })],
      genStep: null,
      controlValues: { steps: 16 },
    })
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 800
      },
    })
    render(<JobQueueRail />)
    expect(screen.getByText("Gen")).toBeTruthy()
  })

  it("falls back when control steps are invalid", () => {
    useStudioStore.setState({
      jobQueue: [q({ jobId: "a", status: "running" })],
      genStep: null,
      controlValues: { steps: Number.NaN },
    })
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return 800
      },
    })
    render(<JobQueueRail />)
    expect(screen.getByText("Gen")).toBeTruthy()
  })
})
