import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  setSetting: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

import { SETTING_SELECTED_BLUEPRINT } from "@/components/studio/slices/setting-keys"
import {
  applyImageFieldsToSource,
  defaultsFromBlueprintDetail,
  filterSessionLoras,
  overlayControlValues,
  overlaySessionControls,
  parseImageSessionFields,
  persistPreferredBlueprint,
  pickBlueprint,
  resetBlueprintSession,
  resolveSessionUpscaleModelId,
  serializeImageSession,
  blueprintSession,
} from "./index"
import type { ImageSessionSource } from "./types"

function imageSource(
  partial: Partial<ImageSessionSource> = {}
): ImageSessionSource {
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
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetBlueprintSession()
})

describe("pickBlueprint", () => {
  it("clears stash and pending session, forces pack defaults", () => {
    blueprintSession.controlValuesByBlueprintId.bp1 = { steps: 40 }
    blueprintSession.pendingSession = {
      v: 1,
      ...serializeImageSession(imageSource()),
    }
    pickBlueprint("bp1")
    expect(blueprintSession.forceBlueprintDefaults).toBe(true)
    expect(blueprintSession.pendingSession).toBeNull()
    expect(blueprintSession.preferredBlueprintId).toBe("bp1")
    expect(blueprintSession.controlValuesByBlueprintId.bp1).toBeUndefined()

    persistPreferredBlueprint("bp1")
    expect(host.setSetting).toHaveBeenCalledWith(
      SETTING_SELECTED_BLUEPRINT,
      "bp1"
    )
    host.setSetting.mockRejectedValueOnce(new Error("x"))
    persistPreferredBlueprint("bp2")
  })
})

describe("image session parse/serialize", () => {
  it("round-trips image fields and overlays", () => {
    const ser = serializeImageSession(imageSource({ usduScale: 4 }))
    expect(ser.usduScale).toBe(4)
    expect(serializeImageSession(imageSource({ usduScale: 2 })).usduScale).toBe(
      2
    )

    const parsed = parseImageSessionFields({
      usduScale: 4,
      selectedGalleryId: "gal-1",
      loraStack: [
        { id: "a", strength: 1 },
        null,
        { id: "", strength: 1 },
        { id: "b", strength: "x" },
      ],
      controlValues: null,
      upscaleModelId: "",
      aspectId: "",
    })
    expect(parsed).toMatchObject({
      usduScale: 4,
      aspectId: "1:1",
      selectedGalleryId: "gal-1",
      loraStack: [{ id: "a", strength: 1 }],
    })

    const merged = applyImageFieldsToSource(
      imageSource({ prompt: "live" }),
      parsed
    )
    expect(merged.prompt).toBe("")
    expect(merged.selectedGalleryId).toBe("gal-1")

    expect(overlayControlValues({ a: 1 }, { a: 2, b: 3 }, ["a"])).toEqual({
      a: 2,
    })
    expect(
      overlaySessionControls({ a: 1 }, { controlValues: { a: 9 } }, ["a"])
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
  })
})

describe("defaultsFromBlueprintDetail", () => {
  it("merges pack defaults over per-control fallbacks", () => {
    expect(
      defaultsFromBlueprintDetail({
        id: "krea",
        name: "K",
        category: "image",
        description: "",
        runtime: "comfy",
        minimumVramGb: null,
        modelCount: 1,
        modelsReady: 1,
        arch: "flux",
        defaults: { steps: 8, cfg: 1, extra: 9 },
        controls: [
          {
            id: "steps",
            type: "number",
            nodeId: "1",
            input: "steps",
            default: 26,
          },
          { id: "cfg", type: "number", nodeId: "1", input: "cfg", default: 4 },
          {
            id: "seed",
            type: "number",
            nodeId: "1",
            input: "seed",
            default: 0,
          },
        ],
      })
    ).toEqual({ steps: 8, cfg: 1, seed: 0 })
  })
})
