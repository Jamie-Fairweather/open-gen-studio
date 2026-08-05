import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ToolRunBar } from "./tool-run-bar"

describe("ToolRunBar", () => {
  it("idle / busy / error states", async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <ToolRunBar
        label="Go"
        busy={false}
        disabled={false}
        jobId={null}
        status={null}
        error={null}
        onRun={onRun}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole("button", { name: /Go/i }))
    expect(onRun).toHaveBeenCalled()

    rerender(
      <ToolRunBar
        label="Go"
        busy
        disabled={false}
        jobId="j1"
        status="Working"
        error="boom"
        onRun={onRun}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText("Working")).toBeTruthy()
    expect(screen.getByText("boom")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
