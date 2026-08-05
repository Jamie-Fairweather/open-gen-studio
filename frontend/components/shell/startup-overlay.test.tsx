/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  startupHydrated: false,
}))

vi.mock("@/components/studio/store", () => ({
  useStudioStore: (sel: (s: typeof store) => unknown) => sel(store),
}))

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: vi.fn(() => false),
}))

import { useMediaQuery } from "@/hooks/use-media-query"
import { StartupOverlay } from "./startup-overlay"

function stubMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn((query: string) => {
    const matches = reduced && query.includes("prefers-reduced-motion")
    return {
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as MediaQueryList
  })
}

describe("StartupOverlay", () => {
  beforeEach(() => {
    store.startupHydrated = false
    vi.mocked(useMediaQuery).mockReturnValue(false)
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("animates in, ignores duplicate dismiss, then exits", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { rerender } = render(<StartupOverlay />)
    expect(
      screen.getByLabelText("Open Gen Studio is starting")
    ).toBeInTheDocument()

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })

    store.startupHydrated = true
    rerender(<StartupOverlay />)
    store.startupHydrated = true
    rerender(<StartupOverlay />)

    await act(async () => {
      vi.advanceTimersByTime(600)
    })

    await waitFor(
      () => {
        expect(
          screen.queryByLabelText("Open Gen Studio is starting")
        ).toBeNull()
      },
      { timeout: 2000 }
    )
    vi.useRealTimers()
  })

  it("skips exit animation under reduced motion", async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true)
    stubMatchMedia(true)

    store.startupHydrated = true
    render(<StartupOverlay />)
    await waitFor(
      () => {
        expect(
          screen.queryByLabelText("Open Gen Studio is starting")
        ).toBeNull()
      },
      { timeout: 2000 }
    )
  })
})
