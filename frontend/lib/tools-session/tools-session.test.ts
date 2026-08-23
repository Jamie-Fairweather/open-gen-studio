import { describe, expect, it } from "vitest"
import {
  currentToolsPath,
  isKnownToolsPath,
  parseToolsSessionFields,
  serializeToolsSession,
} from "./index"

describe("tools-session", () => {
  it("knows tools routes and parses persisted tool fields", () => {
    expect(isKnownToolsPath(null)).toBe(false)
    expect(isKnownToolsPath("/tools")).toBe(true)
    expect(currentToolsPath()).toBeNull()

    const prev = globalThis.window
    // @ts-expect-error test shim
    globalThis.window = { location: { pathname: "/tools/image-to-prompt" } }
    expect(currentToolsPath()).toBe("/tools/image-to-prompt")
    // @ts-expect-error restore
    globalThis.window = { location: { pathname: "/image" } }
    expect(currentToolsPath()).toBeNull()
    globalThis.window = prev

    const parsed = parseToolsSessionFields({
      toolsPath: "/tools",
      imageToPrompt: {
        imagePath: "/img.png",
        previewUrl: "/prev.png",
        format: "nope",
        target: "nope",
        fields: { Subject: "x" },
        negative: "bad",
      },
      promptEnhance: { mode: "", styleLook: "", negative: "neg" },
    })
    expect(parsed).toMatchObject({
      toolsPath: "/tools",
      imageToPrompt: {
        imagePath: "/img.png",
        previewUrl: "/prev.png",
        negative: "bad",
        format: "general",
        target: "auto",
      },
      promptEnhance: {
        negative: "neg",
        mode: "expand",
        styleLook: "cinematic",
      },
    })

    expect(
      parseToolsSessionFields({
        toolsPath: "/nope",
        imageToPrompt: {
          imagePath: 1,
          previewUrl: 1,
          negative: 1,
          galleryOpen: 1,
        },
        promptEnhance: { negative: 1 },
      })
    ).toMatchObject({
      toolsPath: null,
      imageToPrompt: {
        imagePath: null,
        previewUrl: null,
        negative: null,
      },
      promptEnhance: { negative: null },
    })

    expect(
      parseToolsSessionFields({
        imageToPrompt: { format: "structured", target: "flux" },
        promptEnhance: { target: "zImageKrea" },
      }).imageToPrompt
    ).toMatchObject({ format: "structured", target: "flux" })
    expect(
      parseToolsSessionFields({
        imageToPrompt: { format: "graphicDesign", target: "ideogram" },
      }).imageToPrompt
    ).toMatchObject({ format: "graphicDesign", target: "ideogram" })
    expect(
      parseToolsSessionFields({
        imageToPrompt: { format: "json", target: "qwenImage" },
      }).imageToPrompt
    ).toMatchObject({ format: "json", target: "qwenImage" })
    expect(
      parseToolsSessionFields({
        imageToPrompt: { target: "stableDiffusion" },
      }).imageToPrompt.target
    ).toBe("stableDiffusion")

    const ser = serializeToolsSession({
      imageToPrompt: {
        imagePath: null,
        previewUrl: null,
        format: "general",
        target: "auto",
        result: "",
        negative: null,
        fields: null,
        galleryOpen: false,
      },
      promptEnhance: {
        input: "",
        result: "",
        negative: null,
        target: "auto",
        mode: "expand",
        styleLook: "cinematic",
        seeded: false,
      },
    })
    expect(ser.toolsPath).toBeNull()
    expect(ser.imageToPrompt.format).toBe("general")
  })
})
