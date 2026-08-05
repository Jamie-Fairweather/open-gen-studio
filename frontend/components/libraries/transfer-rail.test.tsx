import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { TransferRail } from "./transfer-rail"

describe("TransferRail", () => {
  it("hides the fill when idle", () => {
    const { rerender, container } = render(<TransferRail value={40} />)
    const indicator = () =>
      container.querySelector('[data-slot="progress-indicator"]')

    expect(indicator()?.className).not.toMatch(/opacity-0/)
    rerender(<TransferRail value={0} idle />)
    expect(indicator()?.className).toMatch(/opacity-0/)
  })
})
