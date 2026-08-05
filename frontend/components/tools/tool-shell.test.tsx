import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  ToolChipRow,
  ToolFieldLabel,
  ToolSurface,
  ToolSurfaceHeader,
} from "./tool-shell"

describe("tool-shell", () => {
  it("renders surface, header, label, chips", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ToolSurface className="x">
        <ToolSurfaceHeader
          title="T"
          actions={<button type="button">A</button>}
        />
        <ToolSurfaceHeader title="Bare" />
        <ToolFieldLabel>L</ToolFieldLabel>
        <ToolChipRow
          label="Mode"
          options={[
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ]}
          value="a"
          onChange={onChange}
        />
        <ToolChipRow
          label="Off"
          options={[{ id: "x", label: "X" }]}
          value="x"
          onChange={onChange}
          disabled
        />
      </ToolSurface>
    )
    expect(screen.getByText("T")).toBeTruthy()
    expect(screen.getByText("Bare")).toBeTruthy()
    await user.click(screen.getByRole("radio", { name: "B" }))
    expect(onChange).toHaveBeenCalledWith("b")
  })
})
