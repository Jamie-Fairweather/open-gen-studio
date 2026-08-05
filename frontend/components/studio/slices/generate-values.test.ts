import { describe, expect, it } from "vitest"
import type { BlueprintDetail, LoraPack } from "@/lib/host"
import { buildGenerateValues } from "./generate-values"

const packs: LoraPack[] = [
  {
    id: "p1",
    name: "P",
    description: "",
    source: "official",
    triggerWords: [],
    defaultStrength: null,
    strengthMin: null,
    strengthMax: null,
    arches: ["flux"],
    variants: [
      {
        arch: "flux",
        filename: "a.safetensors",
        path: "loras",
        url: "",
        ready: true,
      },
    ],
    variantsReady: 1,
    variantCount: 1,
    thumbnailPath: null,
  },
]

function detail(partial: Partial<BlueprintDetail> = {}): BlueprintDetail {
  return {
    id: "bp",
    name: "BP",
    category: "image",
    description: "",
    runtime: "comfy",
    minimumVramGb: null,
    modelCount: 1,
    modelsReady: 1,
    controls: [
      { id: "cfg", type: "number", nodeId: "1", input: "number", default: 3 },
    ],
    capabilities: { negative: true, loras: true },
    arch: "flux",
    ...partial,
  }
}

const base = {
  prompt: "  hi  ",
  controlValues: { cfg: 2, negative: " bad ", seed: 1 } as Record<
    string,
    unknown
  >,
  activeDetail: detail(),
  activeArch: "flux",
  loraStack: [{ id: "p1", strength: 0.8 }],
  loraPacks: packs,
  studioTab: "image" as const,
  upscaleEnabled: true,
  upscaleModelId: "",
  usduEnabled: true,
  usduScale: 2,
  usduSteps: 10,
  usduDenoise: 0.2,
}

describe("buildGenerateValues", () => {
  it("includes negative/loras/upscale when supported", () => {
    const v = buildGenerateValues(base)
    expect(v.prompt).toBe("hi")
    expect(v.negative).toBe("bad")
    expect(v.loras).toEqual([{ id: "p1", strength: 0.8 }])
    expect(v.upscale).toEqual({
      modelId: "4x-nomos2-hq-dat2",
      usdu: true,
      usduScale: 2,
      usduSteps: 10,
      usduDenoise: 0.2,
    })
  })

  it("strips negative/loras/upscale on unsupported paths", () => {
    const v = buildGenerateValues({
      ...base,
      controlValues: {
        cfg: 1,
        negative: "x",
        loras: [{ id: "p1", strength: 1 }],
      },
      activeDetail: detail({
        capabilities: { negative: true, loras: false },
        controls: [],
      }),
      activeArch: null,
      upscaleEnabled: false,
      studioTab: "video",
    })
    expect(v.negative).toBeUndefined()
    expect(v.loras).toBeUndefined()
    expect(v.upscale).toBeUndefined()
  })

  it("uses empty negative when cfg enables negative but value omitted", () => {
    const v = buildGenerateValues({
      ...base,
      controlValues: { cfg: 2, seed: 1 },
    })
    expect(v.negative).toBe("")
  })

  it("omits usdu fields when usdu disabled", () => {
    const v = buildGenerateValues({
      ...base,
      usduEnabled: false,
      upscaleModelId: "m1",
    })
    expect(v.upscale).toEqual({ modelId: "m1", usdu: false })
  })
})
