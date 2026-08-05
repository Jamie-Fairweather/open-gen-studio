/** @vitest-environment jsdom */
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const store = vi.hoisted(() => ({
  startupHydrated: false,
  blueprintsLoaded: true,
  onboardingCoverReady: false,
  runtimes: [
    {
      engine: "comfyui",
      status: "ready",
      installPath: "C:/comfy",
    },
  ] as never[],
  blueprints: [
    {
      id: "krea2-turbo",
      source: "official",
      modelCount: 1,
      modelsReady: 1,
    },
  ] as never[],
}))

vi.mock("@/components/studio/store", () => ({
  useStudioStore: (sel: (s: typeof store) => unknown) => sel(store),
}))

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: vi.fn(() => false),
}))

vi.mock("@/lib/host", () => ({
  isTauri: vi.fn(() => true),
}))

import { useMediaQuery } from "@/hooks/use-media-query"
import { isTauri } from "@/lib/host"
import { canDismissStartupOverlay, StartupOverlay } from "./startup-overlay"

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

describe("canDismissStartupOverlay", () => {
  it("waits for onboarding cover when first-run is required", () => {
    expect(
      canDismissStartupOverlay({
        startupHydrated: true,
        blueprintsLoaded: true,
        onboardingCoverReady: false,
        needsOnboarding: true,
        tauri: true,
      })
    ).toBe(false)
    expect(
      canDismissStartupOverlay({
        startupHydrated: true,
        blueprintsLoaded: true,
        onboardingCoverReady: true,
        needsOnboarding: true,
        tauri: true,
      })
    ).toBe(true)
  })

  it("dismisses after hydrate when onboarding is not needed", () => {
    expect(
      canDismissStartupOverlay({
        startupHydrated: true,
        blueprintsLoaded: true,
        onboardingCoverReady: false,
        needsOnboarding: false,
        tauri: true,
      })
    ).toBe(true)
  })

  it("keeps covering while the blueprint catalog is still loading", () => {
    expect(
      canDismissStartupOverlay({
        startupHydrated: true,
        blueprintsLoaded: false,
        onboardingCoverReady: false,
        needsOnboarding: true,
        tauri: true,
      })
    ).toBe(false)
  })
})

describe("StartupOverlay", () => {
  beforeEach(() => {
    store.startupHydrated = false
    store.blueprintsLoaded = true
    store.onboardingCoverReady = false
    store.runtimes = [
      {
        engine: "comfyui",
        status: "ready",
        installPath: "C:/comfy",
      },
    ] as never[]
    store.blueprints = [
      {
        id: "krea2-turbo",
        source: "official",
        modelCount: 1,
        modelsReady: 1,
      },
    ] as never[]
    vi.mocked(useMediaQuery).mockReturnValue(false)
    vi.mocked(isTauri).mockReturnValue(true)
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

  it("stays up until onboarding cover is ready when setup is required", async () => {
    store.runtimes = []
    store.blueprints = []
    store.startupHydrated = true
    store.onboardingCoverReady = false
    const { rerender } = render(<StartupOverlay />)
    expect(
      screen.getByLabelText("Open Gen Studio is starting")
    ).toBeInTheDocument()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(
      screen.getByLabelText("Open Gen Studio is starting")
    ).toBeInTheDocument()

    store.onboardingCoverReady = true
    rerender(<StartupOverlay />)
    await waitFor(() => {
      expect(screen.queryByLabelText("Open Gen Studio is starting")).toBeNull()
    })
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
