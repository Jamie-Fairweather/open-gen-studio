/** @vitest-environment jsdom */
import type React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => {
  let progressHandler: ((p: unknown) => void) | null = null
  let closeHandler: ((m: string) => void) | null = null
  return {
    isTauri: vi.fn(() => true),
    onDataDirProgress: vi.fn(async (handler: (p: unknown) => void) => {
      progressHandler = handler
      return () => {
        progressHandler = null
      }
    }),
    onDataDirCloseBlocked: vi.fn(async (handler: (m: string) => void) => {
      closeHandler = handler
      return () => {
        closeHandler = null
      }
    }),
    emitProgress: (p: unknown) => progressHandler?.(p),
    emitCloseBlocked: (m: string) => closeHandler?.(m),
  }
})

const notifyError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/host", () => ({
  isTauri: () => host.isTauri(),
  onDataDirProgress: (...a: unknown[]) =>
    host.onDataDirProgress(...(a as [never])),
  onDataDirCloseBlocked: (...a: unknown[]) =>
    host.onDataDirCloseBlocked(...(a as [never])),
}))

vi.mock("@/lib/notify", () => ({
  notifyError,
}))

vi.mock("@/components/shell/titlebar", () => ({
  Titlebar: ({ leading }: { leading?: React.ReactNode }) => (
    <div data-testid="titlebar">{leading}</div>
  ),
}))

import {
  beginDataDirMove,
  endDataDirMove,
  updateDataDirMove,
} from "@/lib/data-dir-move"
import { DataDirMoveOverlay } from "./data-dir-move-overlay"

describe("DataDirMoveOverlay", () => {
  beforeEach(() => {
    endDataDirMove()
    vi.clearAllMocks()
    host.isTauri.mockReturnValue(true)
  })

  afterEach(() => {
    endDataDirMove()
  })

  it("renders nothing when inactive and covers SSR snapshots", () => {
    expect(renderToString(<DataDirMoveOverlay />)).toBe("")
    const { container } = render(<DataDirMoveOverlay />)
    expect(container.firstChild).toBeNull()
  })

  it("shows progress and listens for host events while active", async () => {
    beginDataDirMove("Preparing…")
    render(<DataDirMoveOverlay />)

    expect(
      screen.getByRole("alertdialog", { name: "Moving data folder" })
    ).toBeInTheDocument()
    expect(screen.getByText("Moving your library")).toBeInTheDocument()
    expect(screen.getByText("Preparing…")).toBeInTheDocument()

    await waitFor(() => {
      expect(host.onDataDirProgress).toHaveBeenCalled()
      expect(host.onDataDirCloseBlocked).toHaveBeenCalled()
    })

    act(() => {
      host.emitProgress({
        stage: "moving",
        message: "Moving models…",
        current: 2,
        total: 4,
      })
    })
    expect(screen.getByText(/Moving models…/)).toBeInTheDocument()
    expect(screen.getByText(/\(2\/4\)/)).toBeInTheDocument()

    act(() => {
      host.emitCloseBlocked("Wait for the data folder move to finish.")
    })
    expect(notifyError).toHaveBeenCalledWith(
      "Wait for the data folder move to finish.",
      "Can't close yet"
    )
  })

  it("unsubscribes on unmount and ignores late events", async () => {
    beginDataDirMove()
    const { unmount } = render(<DataDirMoveOverlay />)
    await waitFor(() => expect(host.onDataDirProgress).toHaveBeenCalled())

    unmount()
    act(() => {
      host.emitProgress({
        stage: "moving",
        message: "late",
        current: 1,
        total: 1,
      })
      host.emitCloseBlocked("late close")
    })
    expect(notifyError).not.toHaveBeenCalled()
  })

  it("skips host listeners outside Tauri", () => {
    host.isTauri.mockReturnValue(false)
    beginDataDirMove()
    render(<DataDirMoveOverlay />)
    expect(host.onDataDirProgress).not.toHaveBeenCalled()
    expect(screen.getByText("Moving your library")).toBeInTheDocument()
  })

  it("falls back when progress is cleared mid-move", () => {
    beginDataDirMove()
    const { rerender } = render(<DataDirMoveOverlay />)
    act(() => {
      updateDataDirMove({
        stage: "moving",
        message: "Copying…",
        current: 1,
        total: 2,
      })
    })
    // Force a null progress while still active via internal update path
    // (active stays true; message falls back).
    act(() => {
      beginDataDirMove()
    })
    rerender(<DataDirMoveOverlay />)
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })
})
