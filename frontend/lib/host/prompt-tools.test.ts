import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  listPromptToolWeights: vi.fn(async () => []),
  ensurePromptToolsProvider: vi.fn(async () => {}),
  saveTempToolImage: vi.fn(async () => "/tmp/x.png"),
  runImageToPrompt: vi.fn(async () => ({ id: "j1" })),
  runPromptEnhance: vi.fn(async () => ({ id: "j2" })),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  ensurePromptToolsProvider,
  listPromptToolWeights,
  runImageToPrompt,
  runPromptEnhance,
  saveTempToolImage,
} from "./prompt-tools"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("prompt-tools host wrappers", () => {
  it("delegates with null defaults for optional arch/mode", async () => {
    await listPromptToolWeights()
    await ensurePromptToolsProvider("local")

    await saveTempToolImage(new Uint8Array([1, 2, 3]), "png")
    expect(commands.saveTempToolImage).toHaveBeenCalledWith([1, 2, 3], "png")
    await saveTempToolImage([4, 5], "jpg")
    expect(commands.saveTempToolImage).toHaveBeenCalledWith([4, 5], "jpg")

    await runImageToPrompt({
      imagePath: "/a.png",
      format: "general",
      target: "auto",
    })
    expect(commands.runImageToPrompt).toHaveBeenCalledWith({
      imagePath: "/a.png",
      format: "general",
      target: "auto",
      arch: null,
    })
    await runImageToPrompt({
      imagePath: "/a.png",
      format: "general",
      target: "auto",
      arch: "flux",
    })
    expect(commands.runImageToPrompt).toHaveBeenCalledWith({
      imagePath: "/a.png",
      format: "general",
      target: "auto",
      arch: "flux",
    })

    await runPromptEnhance({ prompt: "hi", target: "auto" })
    expect(commands.runPromptEnhance).toHaveBeenCalledWith({
      prompt: "hi",
      target: "auto",
      arch: null,
      mode: null,
    })
    await runPromptEnhance({
      prompt: "hi",
      target: "auto",
      arch: "sdxl",
      mode: "expand",
    })
    expect(commands.runPromptEnhance).toHaveBeenCalledWith({
      prompt: "hi",
      target: "auto",
      arch: "sdxl",
      mode: "expand",
    })
  })
})
