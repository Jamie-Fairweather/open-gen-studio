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

import { ToolsIndex } from "./tools-index"

describe("ToolsIndex", () => {
  it("lists both tools", () => {
    render(<ToolsIndex />)
    expect(screen.getByText("Image to Prompt")).toBeTruthy()
    expect(screen.getByText("Prompt Enhancer")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: /Image to Prompt/i })
    ).toHaveAttribute("href", "/tools/image-to-prompt")
  })
})
