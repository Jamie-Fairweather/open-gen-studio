/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const state = {
  desktop: false,
  studioTab: "image",
  downloadSnapshot: { active: null as unknown, queued: [] as unknown[] },
}

vi.mock("./store", () => ({
  useStudioStore: (sel: (s: typeof state) => unknown) => sel(state),
}))
vi.mock("./studio-dialogs", () => ({
  StudioDialogs: () => <div>dialogs</div>,
}))
vi.mock("@/components/job-queue-chrome", () => ({
  JobQueueRail: () => <div>queue</div>,
}))
vi.mock("@/components/shell", () => ({
  Titlebar: ({
    children,
    leading,
  }: {
    children: React.ReactNode
    leading: React.ReactNode
  }) => (
    <div>
      {leading}
      {children}
    </div>
  ),
}))
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

import { StudioChrome } from "./studio-chrome"

describe("StudioChrome", () => {
  beforeEach(() => cleanup())

  it("web gate and desktop chrome with download dot", () => {
    state.desktop = false
    const { rerender } = render(
      <StudioChrome>
        <span>kid</span>
      </StudioChrome>
    )
    expect(screen.getByText(/Tauri desktop shell/i)).toBeInTheDocument()

    state.desktop = true
    state.studioTab = "image"
    state.downloadSnapshot = { active: null, queued: [{ id: "q1" }] }
    rerender(
      <StudioChrome>
        <span>kid</span>
      </StudioChrome>
    )
    expect(screen.getByLabelText("Download in progress")).toBeInTheDocument()
    expect(screen.getByText("Video")).toBeInTheDocument()

    state.studioTab = "tools"
    state.downloadSnapshot = {
      active: { id: "d1" },
      queued: [],
    }
    rerender(
      <StudioChrome>
        <span>kid</span>
      </StudioChrome>
    )
    expect(screen.getByText("kid")).toBeInTheDocument()
    expect(document.querySelector('a[href="/settings"]')).toBeTruthy()

    state.studioTab = "settings"
    rerender(
      <StudioChrome>
        <span>kid</span>
      </StudioChrome>
    )
    expect(document.querySelector('a[href="/settings"]')).toBeTruthy()
    expect(screen.getByText("dialogs")).toBeInTheDocument()
    expect(screen.getByText("queue")).toBeInTheDocument()
  })
})
