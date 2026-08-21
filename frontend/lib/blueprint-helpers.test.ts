import { describe, expect, it } from "vitest"
import type { Blueprint, GalleryRecipe, LoraPack } from "@/lib/host"
import {
  applyReuseAllSettings,
  catalogInstallLabel,
  catalogOriginLabel,
  isInstalled,
  lorasFromRecipe,
  pickDefaultBlueprintId,
  upscaleFromRecipe,
} from "./blueprint-helpers"

function bp(partial: Partial<Blueprint> & Pick<Blueprint, "id">): Blueprint {
  return {
    name: partial.id,
    category: "image",
    description: "",
    arch: "flux",
    runtime: "comfy",
    source: "official",
    minimumVramGb: null,
    modelCount: 1,
    modelsReady: 1,
    totalSizeBytes: null,
    localSizeBytes: 0,
    dir: "",
    thumbnailPath: null,
    ...partial,
  }
}

const recipe = (values: Record<string, unknown>): GalleryRecipe => ({
  blueprintId: "a",
  blueprintName: "A",
  category: "image",
  runtime: "comfy",
  prompt: "hi",
  values,
})

describe("catalogOriginLabel / catalogInstallLabel", () => {
  it("maps source and install state", () => {
    expect(catalogOriginLabel("user")).toBe("Mine")
    expect(catalogOriginLabel("registry")).toBe("Registry")
    expect(catalogOriginLabel("official")).toBe("Official")
    expect(catalogInstallLabel(true)).toBe("Installed")
    expect(catalogInstallLabel(false)).toBe("Not installed")
  })
})

describe("isInstalled / pickDefaultBlueprintId", () => {
  it("checks readiness and picks preferred/tab/installed", () => {
    expect(isInstalled(bp({ id: "x", modelCount: 0 }))).toBe(true)
    expect(isInstalled(bp({ id: "x", modelsReady: 0, modelCount: 1 }))).toBe(
      false
    )
    const list = [
      bp({ id: "v", category: "video", modelsReady: 1 }),
      bp({ id: "i0", category: "image", modelsReady: 0 }),
      bp({ id: "i1", category: "image", modelsReady: 1 }),
    ]
    expect(pickDefaultBlueprintId(list, "i0")).toBe("i0")
    expect(pickDefaultBlueprintId(list, "gone")).toBe("i1")
    expect(pickDefaultBlueprintId([list[1]!], null)).toBe("i0")
    expect(pickDefaultBlueprintId([], null)).toBeNull()
  })
})

describe("applyReuseAllSettings", () => {
  it("copies values except prompt/loras/upscale", () => {
    expect(
      applyReuseAllSettings(
        { seed: 1, prompt: "old" },
        recipe({ seed: 9, prompt: "p", loras: [], upscale: {}, cfg: 2 })
      )
    ).toEqual({ seed: 9, prompt: "old", cfg: 2 })
  })
})

describe("upscaleFromRecipe", () => {
  it("defaults when missing/invalid and parses object fields", () => {
    const d = upscaleFromRecipe(recipe({}), "flux")
    expect(d.enabled).toBe(false)
    expect(d.usduSteps).toBe(12)
    expect(d.usduDenoise).toBe(0.2)

    const u = upscaleFromRecipe(
      recipe({
        upscale: {
          modelId: "m1",
          usdu: true,
          usduScale: 4,
          usduSteps: 99,
          usduDenoise: 0.01,
        },
      }),
      "krea2"
    )
    expect(u).toMatchObject({
      enabled: true,
      modelId: "m1",
      usduEnabled: true,
      usduScale: 4,
      usduSteps: 40,
      usduDenoise: 0.05,
    })

    const bad = upscaleFromRecipe(
      recipe({ upscale: { modelId: "", usduSteps: "x", usduDenoise: "y" } }),
      "sdxl"
    )
    expect(bad.modelId).toBe("4x-nomos2-hq-dat2")
    expect(bad.usduSteps).toBe(12)
    expect(bad.usduDenoise).toBe(0.25)
    expect(upscaleFromRecipe(recipe({ upscale: [] })).enabled).toBe(false)
  })
})

describe("lorasFromRecipe", () => {
  const packs: LoraPack[] = [
    {
      id: "pack1",
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

  it("maps id/filename entries and skips invalid", () => {
    expect(lorasFromRecipe(recipe({ loras: "nope" }), packs)).toEqual([])
    expect(
      lorasFromRecipe(
        recipe({
          loras: [
            null,
            { strength: 0.5 },
            { id: "pack1", strength: Number.NaN },
            { id: "pack1", strength: "bad" },
            { id: "pack1", strength: 0.8 },
            { filename: "a.safetensors", strength: 0.3 },
            { filename: "missing.safetensors", strength: 1 },
          ],
        }),
        packs
      )
    ).toEqual([
      { id: "pack1", strength: 0.8 },
      { id: "pack1", strength: 0.3 },
    ])
  })
})
