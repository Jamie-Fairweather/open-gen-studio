import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ToolPanelChrome } from "./tool-panel-chrome"

describe("ToolPanelChrome", () => {
  it("renders title, description, back link, children", () => {
    render(
      <ToolPanelChrome title="Tip" description="Desc">
        <p>Body</p>
      </ToolPanelChrome>
    )
    expect(screen.getByText("Tip")).toBeTruthy()
    expect(screen.getByText("Desc")).toBeTruthy()
    expect(screen.getByText("Body")).toBeTruthy()
    expect(screen.getByRole("link", { name: /Tools/i })).toHaveAttribute(
      "href",
      "/tools"
    )
  })
})
