/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const win = vi.hoisted(() => {
  let resizedCb: (() => void) | null = null
  return {
    isMaximized: vi.fn(async () => false),
    unmaximize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    setFullscreen: vi.fn(async () => {}),
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    onResized: vi.fn(async (cb: () => void) => {
      resizedCb = cb
      return () => {
        resizedCb = null
      }
    }),
    emitResized: () => resizedCb?.(),
  }
})

const isTauri = vi.hoisted(() => vi.fn(() => false))
const notifyError = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => win,
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ isTauri })
})

vi.mock("@/lib/notify", () => ({
  notifyError,
  notify: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyProgress: vi.fn(),
  notifyDismiss: vi.fn(),
}))

import { resetTitlebarFullscreenForTests, Titlebar } from "./titlebar"

describe("Titlebar", () => {
  beforeEach(() => {
    resetTitlebarFullscreenForTests()
    isTauri.mockReset().mockReturnValue(false)
    notifyError.mockReset()
    win.isMaximized.mockReset().mockResolvedValue(false)
    win.unmaximize.mockReset().mockResolvedValue(undefined)
    win.maximize.mockReset().mockResolvedValue(undefined)
    win.setFullscreen.mockReset().mockResolvedValue(undefined)
    win.minimize.mockReset().mockResolvedValue(undefined)
    win.toggleMaximize.mockReset().mockResolvedValue(undefined)
    win.close.mockReset().mockResolvedValue(undefined)
    win.onResized.mockClear()
  })

  it("uses the SSR fullscreen snapshot", () => {
    const html = renderToString(<Titlebar />)
    expect(html).toContain("Fullscreen")
  })

  it("renders slots and window controls without Tauri hydrate", async () => {
    const user = userEvent.setup()
    render(
      <Titlebar leading={<span>Lead</span>} trailing={<span>Trail</span>}>
        <span>Center</span>
      </Titlebar>
    )
    expect(screen.getByText("Lead")).toBeInTheDocument()
    expect(screen.getByText("Center")).toBeInTheDocument()
    expect(screen.getByText("Trail")).toBeInTheDocument()
    expect(win.onResized).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Minimize" }))
    expect(win.minimize).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Maximize" }))
    expect(win.toggleMaximize).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Close" }))
    expect(win.close).toHaveBeenCalled()
  })

  it("tracks maximize via Tauri and toggles fullscreen paths", async () => {
    const user = userEvent.setup()
    isTauri.mockReturnValue(true)
    win.isMaximized.mockResolvedValue(true)

    render(<Titlebar />)
    await waitFor(() => expect(win.onResized).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Restore" })
      ).toBeInTheDocument()
    )

    win.isMaximized.mockResolvedValue(false)
    act(() => win.emitResized())
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Maximize" })
      ).toBeInTheDocument()
    )

    // Enter fullscreen from maximized → unmaximize first
    win.isMaximized.mockResolvedValue(true)
    await user.click(screen.getByRole("button", { name: "Fullscreen" }))
    await waitFor(() => expect(win.unmaximize).toHaveBeenCalled())
    await waitFor(() => expect(win.setFullscreen).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: "Exit fullscreen" }).length
      ).toBe(2)
    )
    // Drag must be explicitly disabled (Tauri + app-region CSS).
    expect(
      document.querySelectorAll('[data-tauri-drag-region="false"]').length
    ).toBeGreaterThan(0)
    expect(
      document.querySelectorAll('[data-tauri-drag-region="true"]').length
    ).toBe(0)

    // Exit via the caption maximize/restore control (also labeled Exit fullscreen)
    const exitButtons = screen.getAllByRole("button", {
      name: "Exit fullscreen",
    })
    await user.click(exitButtons[1]!)
    await waitFor(() => expect(win.setFullscreen).toHaveBeenCalledWith(false))
    await waitFor(() => expect(win.maximize).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fullscreen" })
      ).toBeInTheDocument()
    )

    // Enter without maximize, exit via F11
    win.isMaximized.mockResolvedValue(false)
    win.setFullscreen.mockClear()
    await user.click(screen.getByRole("button", { name: "Fullscreen" }))
    await waitFor(() => expect(win.setFullscreen).toHaveBeenCalledWith(true))
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "F11", bubbles: true })
      )
    })
    await waitFor(() => expect(win.setFullscreen).toHaveBeenCalledWith(false))
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Fullscreen" })
      ).toBeInTheDocument()
    )

    win.setFullscreen.mockRejectedValueOnce(new Error("fs"))
    await user.click(screen.getByRole("button", { name: "Fullscreen" }))
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("fs"))

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Fullscreen|Exit fullscreen/ })
      ).toBeInTheDocument()
    )
    // ensure we can trigger non-Error reject from a non-fullscreen state
    const fsBtn = screen.queryByRole("button", { name: "Fullscreen" })
    if (!fsBtn) {
      await user.click(
        screen.getAllByRole("button", { name: "Exit fullscreen" })[0]!
      )
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Fullscreen" })
        ).toBeInTheDocument()
      )
    }
    win.setFullscreen.mockRejectedValueOnce("x")
    await user.click(screen.getByRole("button", { name: "Fullscreen" }))
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("x"))

    win.setFullscreen.mockClear()
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    })
    expect(win.setFullscreen).not.toHaveBeenCalled()
  })
})
