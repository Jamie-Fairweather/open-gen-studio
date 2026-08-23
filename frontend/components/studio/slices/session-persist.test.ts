import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { blueprintSession } from "@/lib/blueprint-session/state"

const host = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  setSetting: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

import {
  bindSessionPersist,
  currentToolsPath,
  filterSessionLoras,
  flushPersistImageSession,
  flushPersistSession,
  flushPersistToolsSession,
  isKnownToolsPath,
  overlayControlValues,
  overlaySessionControls,
  parseStudioSession,
  resolveSessionUpscaleModelId,
  schedulePersistImageSession,
  schedulePersistSession,
  schedulePersistToolsSession,
  serializeStudioSession,
  type StudioSessionSource,
} from "./session-persist"

function source(
  partial: Partial<StudioSessionSource> = {}
): StudioSessionSource {
  return {
    prompt: "p",
    aspectId: "1:1",
    sideLength: 1024,
    controlValues: { seed: 1 },
    loraStack: [{ id: "l", strength: 0.5 }],
    upscaleEnabled: false,
    upscaleModelId: "4x-UltraSharp",
    usduEnabled: false,
    usduScale: 2,
    usduSteps: 8,
    usduDenoise: 0.15,
    selectedGalleryId: null,
    followLive: true,
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
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  blueprintSession.suppressImagePersist = false
  host.isTauri.mockReturnValue(true)
  bindSessionPersist(() => source())
})

afterEach(() => {
  vi.useRealTimers()
  blueprintSession.suppressImagePersist = true
})

describe("session-persist", () => {
  it("parses/serializes/overlays and persists with debounce", () => {
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

    const ser = serializeStudioSession(source({ usduScale: 4 }))
    expect(ser.usduScale).toBe(4)
    expect(serializeStudioSession(source({ usduScale: 2 })).usduScale).toBe(2)

    expect(parseStudioSession(null)).toBeNull()
    expect(parseStudioSession("")).toBeNull()
    expect(parseStudioSession("{")).toBeNull()
    expect(parseStudioSession(JSON.stringify({ v: 2 }))).toBeNull()
    expect(
      parseStudioSession(
        JSON.stringify({
          v: 1,
          usduScale: 4,
          toolsPath: "/tools",
          selectedGalleryId: "gal-1",
          loraStack: [
            { id: "a", strength: 1 },
            null,
            { id: "", strength: 1 },
            { id: "b", strength: "x" },
          ],
          controlValues: null,
          imageToPrompt: {
            imagePath: "/img.png",
            previewUrl: "/prev.png",
            format: "nope",
            target: "nope",
            fields: { Subject: "x" },
            negative: "bad",
          },
          promptEnhance: { mode: "", styleLook: "", negative: "neg" },
          upscaleModelId: "",
          aspectId: "",
        })
      )
    ).toMatchObject({
      v: 1,
      usduScale: 4,
      toolsPath: "/tools",
      aspectId: "1:1",
      selectedGalleryId: "gal-1",
      loraStack: [{ id: "a", strength: 1 }],
      imageToPrompt: {
        imagePath: "/img.png",
        previewUrl: "/prev.png",
        negative: "bad",
      },
      promptEnhance: { negative: "neg" },
    })
    expect(
      parseStudioSession(
        JSON.stringify({
          v: 1,
          toolsPath: "/nope",
          imageToPrompt: {
            imagePath: 1,
            previewUrl: 1,
            negative: 1,
            galleryOpen: 1,
          },
          promptEnhance: { negative: 1 },
          selectedGalleryId: 1,
        })
      )
    ).toMatchObject({
      toolsPath: null,
      selectedGalleryId: null,
      imageToPrompt: {
        imagePath: null,
        previewUrl: null,
        negative: null,
      },
      promptEnhance: { negative: null },
    })
    expect(
      parseStudioSession(JSON.stringify({ v: 1, followLive: true }))?.followLive
    ).toBe(true)
    expect(
      parseStudioSession(JSON.stringify({ v: 1, followLive: "yes" }))
        ?.followLive
    ).toBe(true)

    expect(overlayControlValues({ a: 1 }, { a: 2, b: 3 }, ["a"])).toEqual({
      a: 2,
    })
    expect(
      overlaySessionControls(
        { a: 1 },
        parseStudioSession(JSON.stringify({ v: 1, controlValues: { a: 9 } }))!,
        ["a"]
      )
    ).toEqual({ a: 9 })
    expect(
      filterSessionLoras([{ id: "a", strength: 1 }], new Set(["a"]))
    ).toEqual([{ id: "a", strength: 1 }])
    expect(resolveSessionUpscaleModelId("x", new Set(["x"]))).toBe("x")
    expect(
      resolveSessionUpscaleModelId("missing", new Set(["4x-nomos2-hq-dat2"]))
    ).toBe("4x-nomos2-hq-dat2")
    expect(resolveSessionUpscaleModelId("", new Set())).toBe(
      "4x-nomos2-hq-dat2"
    )
    expect(resolveSessionUpscaleModelId("keep", new Set())).toBe("keep")

    schedulePersistSession()
    schedulePersistSession()
    flushPersistSession()
    expect(host.setSetting).toHaveBeenCalled()

    schedulePersistSession()
    vi.advanceTimersByTime(400)
    expect(host.setSetting).toHaveBeenCalled()

    host.setSetting.mockRejectedValueOnce(new Error("x"))
    flushPersistSession()

    host.isTauri.mockReturnValue(false)
    schedulePersistSession()
    flushPersistSession()

    host.isTauri.mockReturnValue(true)
    blueprintSession.suppressImagePersist = true
    schedulePersistSession()
    flushPersistSession()

    blueprintSession.suppressImagePersist = false
    bindSessionPersist(null as never)
    schedulePersistSession()
    flushPersistSession()
    bindSessionPersist(() => null as never)
    flushPersistSession()
    schedulePersistSession()
    vi.advanceTimersByTime(400)
  })

  it("gates image persist and still writes tools from pending image", () => {
    host.setSetting.mockClear()
    blueprintSession.suppressImagePersist = true
    blueprintSession.pendingSession = parseStudioSession(
      JSON.stringify({
        v: 1,
        prompt: "pending-prompt",
        aspectId: "16:9",
        sideLength: 768,
      })
    )
    schedulePersistImageSession()
    flushPersistImageSession()
    expect(host.setSetting).not.toHaveBeenCalled()

    flushPersistToolsSession()
    expect(host.setSetting).toHaveBeenCalled()
    const payload = JSON.parse(
      String(host.setSetting.mock.calls.at(-1)?.[1] ?? "{}")
    )
    expect(payload.prompt).toBe("pending-prompt")
    expect(payload.aspectId).toBe("16:9")

    host.setSetting.mockClear()
    schedulePersistToolsSession()
    vi.advanceTimersByTime(400)
    expect(host.setSetting).toHaveBeenCalled()

    blueprintSession.suppressImagePersist = false
    blueprintSession.pendingSession = null
    host.setSetting.mockClear()
    schedulePersistImageSession()
    vi.advanceTimersByTime(400)
    expect(host.setSetting).toHaveBeenCalled()
  })
})
