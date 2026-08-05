import { beforeEach, describe, expect, it, vi } from "vitest"

const notifyInfo = vi.hoisted(() => vi.fn())
vi.mock("@/lib/notify", () => ({
  notifyInfo: (...a: unknown[]) => notifyInfo(...a),
}))

import { applyPromptToStudio } from "./apply-prompt-to-studio"

describe("applyPromptToStudio", () => {
  beforeEach(() => {
    notifyInfo.mockReset()
  })

  it("writes prompt/negative and navigates when prompt is non-empty", () => {
    const setPrompt = vi.fn()
    const setControlValues = vi.fn()
    const push = vi.fn()
    applyPromptToStudio({
      prompt: "  ",
      negative: "n",
      hasNegativePrompt: true,
      setPrompt,
      setControlValues,
      router: { push },
    })
    expect(setPrompt).not.toHaveBeenCalled()
    expect(notifyInfo).toHaveBeenCalledWith(
      "Prompt required",
      "Enter a prompt first.",
      "generate"
    )

    applyPromptToStudio({
      prompt: "  hello  ",
      negative: "bad",
      hasNegativePrompt: true,
      setPrompt,
      setControlValues,
      router: { push },
    })
    expect(setPrompt).toHaveBeenCalledWith("hello")
    expect(setControlValues).toHaveBeenCalled()
    const updater = setControlValues.mock.calls[0]![0] as (
      prev: Record<string, unknown>
    ) => Record<string, unknown>
    expect(updater({ seed: 1 })).toEqual({ seed: 1, negative: "bad" })
    expect(push).toHaveBeenCalledWith("/image")

    setControlValues.mockClear()
    applyPromptToStudio({
      prompt: "x",
      negative: "n",
      hasNegativePrompt: false,
      setPrompt,
      setControlValues,
      router: { push },
    })
    expect(setControlValues).not.toHaveBeenCalled()
  })
})
