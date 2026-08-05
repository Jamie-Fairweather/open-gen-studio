import { describe, expect, it } from "vitest"
import type { Blueprint, BlueprintDetail } from "@/lib/host"
import {
  computeActiveDetail,
  computeActiveSelectedId,
  computeTabBlueprints,
} from "./tab-compute"

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

describe("computeTabBlueprints", () => {
  const list = [
    bp({ id: "img", category: "image" }),
    bp({ id: "vid", category: "video" }),
  ]

  it("filters by studio tab category for media tabs", () => {
    expect(computeTabBlueprints(list, "image").map((b) => b.id)).toEqual([
      "img",
    ])
  })

  it("returns all blueprints on downloads, empty on tools/creator", () => {
    expect(computeTabBlueprints(list, "downloads")).toEqual(list)
    expect(computeTabBlueprints(list, "tools")).toEqual([])
    expect(computeTabBlueprints(list, "creator")).toEqual([])
  })
})

describe("computeActiveSelectedId", () => {
  const installed = bp({ id: "a", modelsReady: 1, modelCount: 1 })
  const missing = bp({ id: "b", modelsReady: 0, modelCount: 1 })

  it("keeps a valid selection", () => {
    expect(computeActiveSelectedId([installed, missing], "b")).toBe("b")
  })

  it("falls back to first installed, then first tab blueprint", () => {
    expect(computeActiveSelectedId([missing, installed], "gone")).toBe("a")
    expect(computeActiveSelectedId([missing], null)).toBe("b")
    expect(computeActiveSelectedId([], null)).toBeNull()
  })
})

describe("computeActiveDetail", () => {
  const detail = { id: "a" } as BlueprintDetail

  it("returns detail only when ids match", () => {
    expect(computeActiveDetail(detail, "a")).toBe(detail)
    expect(computeActiveDetail(detail, "b")).toBeNull()
    expect(computeActiveDetail(null, "a")).toBeNull()
  })
})
