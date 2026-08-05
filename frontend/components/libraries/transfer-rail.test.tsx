import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { TransferRail } from "./transfer-rail"

describe("TransferRail", () => {
  it("renders progress and idle marker", () => {
    const { rerender, container } = render(<TransferRail value={40} />)
    expect(container.querySelector("[aria-hidden]")).toBeNull()
    rerender(<TransferRail value={0} idle />)
    expect(container.querySelector("[aria-hidden]")).toBeTruthy()
  })
})
