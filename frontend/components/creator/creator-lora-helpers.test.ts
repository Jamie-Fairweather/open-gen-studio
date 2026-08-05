import { afterEach, describe, expect, it, vi } from "vitest"
import { RECIPE_ARCHES } from "@/lib/arch"
import { looksLikeCivitai, newRow, slugify } from "./creator-lora-helpers"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("slugify", () => {
  it("lowercases and collapses non-alnum runs", () => {
    expect(slugify("My LoRA Pack")).toBe("my-lora-pack")
    expect(slugify("-edge-")).toBe("edge")
  })
})

describe("looksLikeCivitai", () => {
  it("detects civitai hosts", () => {
    expect(looksLikeCivitai("https://civitai.com/models/1")).toBe(true)
    expect(looksLikeCivitai("https://civitai.red/models/1")).toBe(true)
    expect(looksLikeCivitai("https://huggingface.co/x")).toBe(false)
  })
})

describe("newRow", () => {
  it("uses randomUUID with defaults and partial overrides", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-1")
    expect(newRow()).toEqual({
      key: "uuid-1",
      arch: RECIPE_ARCHES[0],
      url: "",
    })
    expect(newRow({ arch: "flux", url: "https://x" })).toEqual({
      key: "uuid-1",
      arch: "flux",
      url: "https://x",
    })
    expect(newRow({ url: "https://only-url" }).arch).toBe(RECIPE_ARCHES[0])
  })

  it("falls back to krea2 when RECIPE_ARCHES is empty", async () => {
    vi.resetModules()
    vi.doMock("@/lib/arch", () => ({
      RECIPE_ARCHES: [],
      isRecipeArch: () => false,
    }))
    const { newRow: newRowEmpty } = await import("./creator-lora-helpers")
    vi.spyOn(crypto, "randomUUID").mockReturnValue("uuid-2")
    expect(newRowEmpty()).toEqual({
      key: "uuid-2",
      arch: "krea2",
      url: "",
    })
    vi.doUnmock("@/lib/arch")
    vi.resetModules()
  })
})
