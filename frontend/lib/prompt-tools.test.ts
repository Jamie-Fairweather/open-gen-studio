import { describe, expect, it } from "vitest"
import {
  emptyStructuredFields,
  enhanceModePayload,
  flattenStructuredFields,
  parseStructuredPrompt,
  targetFromArch,
} from "./prompt-tools"

describe("enhanceModePayload", () => {
  it("encodes style looks and passes other modes through", () => {
    expect(enhanceModePayload("style", "anime")).toBe("style:anime")
    expect(enhanceModePayload("style", "")).toBe("style:cinematic")
    expect(enhanceModePayload("expand")).toBe("expand")
  })
})

describe("structured fields", () => {
  it("empties, parses JSON/labels, and flattens", () => {
    expect(emptyStructuredFields().Subject).toBe("")
    expect(
      parseStructuredPrompt(
        JSON.stringify({ subject: "cat", colors: ["red", "blue"] })
      )
    ).toMatchObject({ Subject: "cat", Colors: "red, blue" })
    expect(parseStructuredPrompt("{")).toBeNull()
    expect(parseStructuredPrompt('{"nope":1}')).toBeNull()
    expect(parseStructuredPrompt("")).toBeNull()
    expect(parseStructuredPrompt("Subject: dog\nMood: calm")).toMatchObject({
      Subject: "dog",
      Mood: "calm",
    })
    expect(parseStructuredPrompt("hello world")).toBeNull()
    expect(
      flattenStructuredFields({
        ...emptyStructuredFields(),
        Subject: " a ",
        Mood: "",
      })
    ).toBe("Subject: a")
  })
})

describe("targetFromArch", () => {
  it("maps arches and loose aliases", () => {
    expect(targetFromArch(null)).toBe("auto")
    expect(targetFromArch("sd")).toBe("stableDiffusion")
    expect(targetFromArch("ideogram")).toBe("ideogram")
    expect(targetFromArch("krea")).toBe("zImageKrea")
    expect(targetFromArch("qwen")).toBe("qwenImage")
    expect(targetFromArch("flux")).toBe("flux")
    expect(targetFromArch("flux2")).toBe("flux")
    expect(targetFromArch("chroma")).toBe("flux")
    expect(targetFromArch("sdxl")).toBe("stableDiffusion")
    expect(targetFromArch("sd15")).toBe("stableDiffusion")
    expect(targetFromArch("pony")).toBe("stableDiffusion")
    expect(targetFromArch("illustrious")).toBe("stableDiffusion")
    expect(targetFromArch("sd3.5")).toBe("stableDiffusion")
    expect(targetFromArch("ideogram4")).toBe("ideogram")
    expect(targetFromArch("qwen-image")).toBe("qwenImage")
    expect(targetFromArch("z-image")).toBe("zImageKrea")
    expect(targetFromArch("krea2")).toBe("zImageKrea")
  })
})
