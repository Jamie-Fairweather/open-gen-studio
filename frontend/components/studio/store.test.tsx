/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ isTauri: vi.fn(() => false) })
})

const { bindSessionPersist } = vi.hoisted(() => ({
  bindSessionPersist: vi.fn(),
}))

vi.mock("./slices/session-persist", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./slices/session-persist")>()
  return {
    ...actual,
    bindSessionPersist,
  }
})

import { useStudioSelector, useStudioStore } from "./store"

describe("useStudioStore", () => {
  it("composes slices and shallow-selects", () => {
    expect(bindSessionPersist).toHaveBeenCalledOnce()
    const getState = bindSessionPersist.mock.calls[0]![0] as () => unknown
    expect(getState()).toBe(useStudioStore.getState())

    expect(useStudioStore.getState().prompt).toBe("")
    useStudioStore.getState().setPrompt("hi")
    expect(useStudioStore.getState().prompt).toBe("hi")

    const { result } = renderHook(() =>
      useStudioSelector((s) => ({ prompt: s.prompt, tab: s.studioTab }))
    )
    expect(result.current).toEqual({ prompt: "hi", tab: "image" })
  })
})
