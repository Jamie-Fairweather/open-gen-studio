/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

const push = vi.fn()
const applyPromptToStudio = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}))

vi.mock("@/components/tools/apply-prompt-to-studio", () => ({
  applyPromptToStudio: (...a: unknown[]) => applyPromptToStudio(...a),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock()
})

vi.mock(
  "@/components/studio/slices/session-persist",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/studio/slices/session-persist")
      >()
    return { ...actual, bindSessionPersist: vi.fn() }
  }
)

import { useStudioStore } from "@/components/studio/store"
import { useToolStudioBridge } from "./use-tool-studio-bridge"

describe("useToolStudioBridge", () => {
  beforeEach(() => {
    applyPromptToStudio.mockReset()
    push.mockReset()
    useStudioStore.setState({
      prompt: "",
      controlValues: {},
      activeDetail: null,
      selectedBlueprintId: null,
      blueprints: [],
    })
  })

  it("sendToStudio forwards to applyPromptToStudio", () => {
    const { result } = renderHook(() => useToolStudioBridge())
    act(() => {
      result.current.sendToStudio("hello", "neg")
    })
    expect(applyPromptToStudio).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "hello",
        negative: "neg",
        router: { push },
      })
    )
  })
})
