import { describe, expect, it, vi } from "vitest"
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
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
}))

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: true,
  }),
}))

import { SortableActiveRow } from "./sortable-active-row"

const item = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "Job",
  status: "queued",
  prompt: "hello",
  meta: "meta",
  ...partial,
})

describe("SortableActiveRow", () => {
  it("handles waiting/running/paused actions and errors", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ul>
        <SortableActiveRow
          item={item({ status: "queued" })}
          index={0}
          total={2}
          stepLabel={null}
        />
      </ul>
    )
    expect(screen.getByLabelText("Drag to reorder")).toBeTruthy()
    expect(screen.getByText(/1\/2/)).toBeTruthy()
    expect(screen.getByText("hello")).toBeTruthy()

    rerender(
      <ul>
        <SortableActiveRow
          item={item({ status: "running", prompt: null })}
          index={0}
          total={1}
          stepLabel="3/8"
        />
      </ul>
    )
    await user.click(screen.getByLabelText("Pause"))
    expect(pauseJob).toHaveBeenCalledWith("j1")
    pauseJob.mockRejectedValueOnce(new Error("p"))
    await user.click(screen.getByLabelText("Pause"))
    expect(notifyError).toHaveBeenCalledWith("p")
    pauseJob.mockRejectedValueOnce("x")
    await user.click(screen.getByLabelText("Pause"))
    expect(notifyError).toHaveBeenCalledWith("x")

    rerender(
      <ul>
        <SortableActiveRow
          item={item({ status: "paused", kind: "prompt-tool" })}
          index={0}
          total={1}
          stepLabel={null}
        />
      </ul>
    )
    await user.click(screen.getByLabelText("Resume"))
    expect(resumeJob).toHaveBeenCalledWith("j1")
    resumeJob.mockRejectedValueOnce(new Error("r"))
    await user.click(screen.getByLabelText("Resume"))
    expect(notifyError).toHaveBeenCalledWith("r")
    resumeJob.mockRejectedValueOnce("rx")
    await user.click(screen.getByLabelText("Resume"))
    expect(notifyError).toHaveBeenCalledWith("rx")

    await user.click(screen.getByLabelText("Cancel"))
    expect(cancelJob).toHaveBeenCalledWith("j1")
    cancelJob.mockRejectedValueOnce(new Error("c"))
    await user.click(screen.getByLabelText("Cancel"))
    expect(notifyError).toHaveBeenCalledWith("c")
    cancelJob.mockRejectedValueOnce("cx")
    await user.click(screen.getByLabelText("Cancel"))
    expect(notifyError).toHaveBeenCalledWith("cx")
  })
})
