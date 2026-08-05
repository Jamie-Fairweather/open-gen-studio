/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getMediaQuerySnapshot,
  subscribeMediaQuery,
  useIsMobile,
  useMediaQuery,
} from "./use-media-query"

type Mql = {
  matches: boolean
  media: string
  addEventListener: (type: string, cb: () => void) => void
  removeEventListener: (type: string, cb: () => void) => void
}

function stubMatchMedia(initial = false) {
  const listeners = new Set<() => void>()
  const mql: Mql = {
    matches: initial,
    media: "",
    addEventListener: (_t, cb) => {
      listeners.add(cb)
    },
    removeEventListener: (_t, cb) => {
      listeners.delete(cb)
    },
  }
  window.matchMedia = vi.fn((query: string) => {
    mql.media = query
    return mql as MediaQueryList
  })
  return {
    mql,
    setMatches(next: boolean) {
      mql.matches = next
      listeners.forEach((cb) => cb())
    },
  }
}

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("parses breakpoint strings, objects, and raw queries", () => {
    const { mql } = stubMatchMedia(true)
    const cases: Array<[Parameters<typeof useMediaQuery>[0], string]> = [
      ["md", "(min-width: 800px)"],
      ["max-md", "(max-width: 799px)"],
      ["md:max-xl", "(min-width: 800px) and (max-width: 1279px)"],
      ["md:unknown", "(min-width: 800px)"],
      ["max-unknown", "max-unknown"],
      ["(orientation: portrait)", "(orientation: portrait)"],
      ["not-a-bp", "not-a-bp"],
      [{}, "(min-width: 0px)"],
      [{ min: "lg" }, "(min-width: 1024px)"],
      [{ max: 900 }, "(max-width: 899px)"],
      [
        { min: 100, max: "xl", pointer: "coarse" },
        "(min-width: 100px) and (max-width: 1279px) and (pointer: coarse)",
      ],
      [{ pointer: "fine" }, "(pointer: fine)"],
    ]

    for (const [query, expected] of cases) {
      const { unmount } = renderHook(() => useMediaQuery(query))
      expect(mql.media).toBe(expected)
      expect(renderHook(() => useMediaQuery(query)).result.current).toBe(true)
      unmount()
    }
  })

  it("subscribes to changes and supports useIsMobile", () => {
    const { setMatches } = stubMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => setMatches(true))
    expect(result.current).toBe(true)
  })

  it("uses getServerSnapshot during SSR", () => {
    stubMatchMedia(true)
    function Probe() {
      return <>{String(useMediaQuery("md"))}</>
    }
    expect(renderToString(<Probe />)).toBe("false")
  })

  it("subscribe and getSnapshot no-op when window is undefined", () => {
    const prev = globalThis.window
    // @ts-expect-error — exercise SSR branch
    delete globalThis.window
    try {
      const unsub = subscribeMediaQuery("(min-width: 800px)", () => {})
      unsub()
      expect(getMediaQuerySnapshot("(min-width: 800px)")).toBe(false)
    } finally {
      globalThis.window = prev
    }
  })
})
