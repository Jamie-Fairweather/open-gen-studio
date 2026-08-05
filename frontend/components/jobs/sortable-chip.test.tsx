import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { JobQueueItem } from "@/lib/host"

const sortableState = vi.hoisted(() => ({ isDragging: false }))

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: sortableState.isDragging
      ? { x: 4, y: 0, scaleX: 1, scaleY: 1 }
      : null,
    transition: undefined,
    isDragging: sortableState.isDragging,
  }),
}))

import {
  CHIP_CHROME_PX,
  SortableChip,
  chipWidthPx,
  labelSlotCh,
  statusSlotCh,
} from "./sortable-chip"

const base = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "Job",
  status: "queued",
  prompt: null,
  meta: null,
  ...partial,
})

describe("sortable-chip helpers", () => {
  it("statusSlotCh / labelSlotCh / chipWidthPx", () => {
    expect(statusSlotCh(0)).toBe("Waiting".length)
    expect(statusSlotCh(20)).toBe(Math.max("Waiting".length, "20/20".length))
    expect(labelSlotCh([])).toBe(10)
    expect(labelSlotCh(["short", "abcdefghijklmnop"])).toBe(16)
    expect(labelSlotCh(["x".repeat(40)])).toBe(18)
    expect(chipWidthPx(10, 7)).toBe(Math.round(CHIP_CHROME_PX + 10 * 7 + 7 * 7))
  })
})

describe("SortableChip", () => {
  it("renders waiting / running / paused action slots", async () => {
    sortableState.isDragging = false
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onCancel = vi.fn()

    const { rerender } = render(
      <SortableChip
        item={base({ status: "queued", label: "Wait" })}
        stepLabel={null}
        chipWidth={200}
        statusCh={7}
        labelCh={10}
        fresh
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByLabelText("Drag to reorder")).toBeTruthy()
    expect(screen.getByText("Waiting")).toBeTruthy()
    await user.click(screen.getByLabelText("Remove from queue"))
    expect(onCancel).toHaveBeenCalled()

    rerender(
      <SortableChip
        item={base({ status: "running", label: "Run" })}
        stepLabel="2/10"
        chipWidth={200}
        statusCh={7}
        labelCh={10}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText("2/10")).toBeTruthy()
    await user.click(screen.getByLabelText("Pause job"))
    expect(onPause).toHaveBeenCalled()
    await user.click(screen.getByLabelText("Cancel job"))

    rerender(
      <SortableChip
        item={base({ status: "paused", label: "Pause" })}
        stepLabel={null}
        chipWidth={200}
        statusCh={7}
        labelCh={10}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText("Paused")).toBeTruthy()
    await user.click(screen.getByLabelText("Resume job"))
    expect(onResume).toHaveBeenCalled()
  })

  it("applies dragging styles", () => {
    sortableState.isDragging = true
    const { container } = render(
      <SortableChip
        item={base({ status: "queued", label: "Drag" })}
        stepLabel={null}
        chipWidth={200}
        statusCh={7}
        labelCh={10}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(container.querySelector(".opacity-80")).toBeTruthy()
  })
})
