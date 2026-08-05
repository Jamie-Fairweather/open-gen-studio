import { describe, expect, it, vi } from "vitest"
import type { Blueprint, BlueprintDetail, GalleryItem } from "@/lib/host"
import type { StudioStore } from "../studio-store-types"
import {
  selectActiveArch,
  selectActiveDetail,
  selectActiveLoraStack,
  selectActiveSelectedId,
  selectAdvancedControls,
  selectCfgValue,
  selectHasNegativePrompt,
  selectHasSizeControls,
  selectLatestGallerySeed,
  selectPreviewItem,
  selectSelected,
  selectSupportsLoras,
  selectTabBlueprints,
  selectTabGallery,
} from "./select-catalog"

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => p,
}))

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

function s(partial: Partial<StudioStore>): StudioStore {
  return {
    blueprints: [],
    studioTab: "image",
    gallery: [],
    selectedId: null,
    detail: null,
    selectedGalleryId: null,
    controlValues: {},
    loraStack: [],
    loraPacks: [],
    ...partial,
  } as StudioStore
}

describe("select-catalog", () => {
  it("scopes blueprints/gallery and derives active selection", () => {
    const list = [bp({ id: "i" }), bp({ id: "v", category: "video" })]
    expect(
      selectTabBlueprints(s({ blueprints: list })).map((b) => b.id)
    ).toEqual(["i"])
    expect(selectTabGallery(s({ studioTab: "tools" }))).toEqual([])
    const g: GalleryItem = {
      id: "g1",
      jobId: null,
      path: "a.png",
      thumbnailPath: null,
      metadataJson: JSON.stringify({ category: "image", values: { seed: 7 } }),
      createdAt: 0,
    }
    expect(selectTabGallery(s({ gallery: [g] }))).toEqual([g])
    expect(
      selectActiveSelectedId(s({ blueprints: list, selectedId: "i" }))
    ).toBe("i")
    const detail = {
      id: "i",
      controls: [
        { id: "width", type: "n", nodeId: "1", input: "w", group: "core" },
        { id: "height", type: "n", nodeId: "1", input: "h", group: "core" },
        { id: "cfg", type: "n", nodeId: "1", input: "c", default: 4 },
        {
          id: "steps",
          type: "n",
          nodeId: "1",
          input: "s",
          group: "advanced",
        },
        { id: "prompt", type: "t", nodeId: "1", input: "p", group: "core" },
      ],
      capabilities: { negative: true, loras: true },
      arch: "flux",
    } as BlueprintDetail
    const store = s({
      blueprints: list,
      selectedId: "i",
      detail,
      controlValues: { cfg: 2 },
      loraStack: [{ id: "p1", strength: 1 }],
      loraPacks: [
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
      ],
      gallery: [g],
      selectedGalleryId: "g1",
    })
    expect(selectActiveDetail(store)?.id).toBe("i")
    expect(selectSelected(store)?.id).toBe("i")
    expect(
      selectSelected(s({ blueprints: [], selectedId: "missing" }))
    ).toBeNull()
    expect(selectPreviewItem(store)?.id).toBe("g1")
    expect(selectPreviewItem(s({ selectedGalleryId: null }))).toBeNull()
    expect(
      selectPreviewItem(
        s({
          selectedGalleryId: "missing",
          gallery: [g],
          studioTab: "image",
        })
      )
    ).toBeNull()
    expect(selectHasSizeControls(store)).toBe(true)
    expect(
      selectHasSizeControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: {
            ...detail,
            controls: detail.controls.filter((c) => c.id !== "width"),
          },
        })
      )
    ).toBe(false)
    expect(
      selectHasSizeControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: {
            ...detail,
            controls: detail.controls.filter((c) => c.id !== "height"),
          },
        })
      )
    ).toBe(false)
    expect(
      selectHasSizeControls(
        s({ detail: null, selectedId: "i", blueprints: list })
      )
    ).toBe(false)
    expect(
      selectHasSizeControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: { id: "i", controls: undefined } as BlueprintDetail,
        })
      )
    ).toBe(false)
    expect(selectCfgValue(store)).toBe(2)
    expect(
      selectCfgValue(s({ detail, selectedId: "i", blueprints: list }))
    ).toBe(4)
    expect(
      selectCfgValue(
        s({
          detail: { ...detail, controls: [] },
          selectedId: "i",
          blueprints: list,
          controlValues: {},
        })
      )
    ).toBe(1)
    expect(selectSupportsLoras(store)).toBe(true)
    expect(selectActiveArch(store)).toBe("flux")
    expect(selectActiveLoraStack(store)).toEqual([{ id: "p1", strength: 1 }])
    expect(
      selectActiveLoraStack(s({ detail: { ...detail, arch: undefined } }))
    ).toEqual([])
    expect(selectHasNegativePrompt(store)).toBe(true)
    expect(selectAdvancedControls(store).map((c) => c.id)).toEqual(["steps"])
    expect(
      selectAdvancedControls(
        s({ blueprints: list, selectedId: "i", detail: null })
      )
    ).toEqual([])
    const sized = {
      ...detail,
      controls: [
        ...detail.controls,
        { id: "width", type: "n", nodeId: "1", input: "w", group: "core" },
        { id: "height", type: "n", nodeId: "1", input: "h", group: "core" },
      ],
    } as BlueprintDetail
    expect(
      selectAdvancedControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: sized,
        })
      ).map((c) => c.id)
    ).not.toContain("width")
    expect(
      selectAdvancedControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: {
            id: "i",
            controls: [
              {
                id: "width",
                type: "n",
                nodeId: "1",
                input: "w",
                group: "core",
              },
              {
                id: "steps",
                type: "n",
                nodeId: "1",
                input: "s",
                group: "advanced",
              },
            ],
          } as BlueprintDetail,
        })
      ).map((c) => c.id)
    ).toContain("width")
    expect(
      selectAdvancedControls(
        s({
          blueprints: list,
          selectedId: "i",
          detail: {
            id: "i",
            controls: [
              {
                id: "height",
                type: "n",
                nodeId: "1",
                input: "h",
                group: "core",
              },
              {
                id: "width",
                type: "n",
                nodeId: "1",
                input: "w",
                group: "core",
              },
              {
                id: "steps",
                type: "n",
                nodeId: "1",
                input: "s",
                group: "advanced",
              },
            ],
          } as BlueprintDetail,
        })
      ).map((c) => c.id)
    ).toEqual(["steps"])
    expect(selectLatestGallerySeed(store)).toBe(7)
    expect(
      selectLatestGallerySeed(s({ studioTab: "image", gallery: [] }))
    ).toBeNull()
  })
})
