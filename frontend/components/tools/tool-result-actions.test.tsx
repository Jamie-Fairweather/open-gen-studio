import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

const notifySuccess = vi.fn()
const writeText = vi.fn(async () => {})

vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}))

import { ToolResultActions } from "./tool-result-actions"

describe("ToolResultActions", () => {
  it("copies and sends to studio", () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const onUse = vi.fn()
    render(
      <ToolResultActions
        copyText="hi"
        copyDisabled={false}
        useInStudioDisabled={false}
        onUseInStudio={onUse}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /Copy/i }))
    expect(writeText).toHaveBeenCalledWith("hi")
    expect(notifySuccess).toHaveBeenCalledWith("Copied")
    fireEvent.click(screen.getByRole("button", { name: /Use in Studio/i }))
    expect(onUse).toHaveBeenCalled()
  })
})
