import { describe, expect, it, vi } from "vitest"
import type { GalleryItem } from "@/lib/host"
import type { StudioStore } from "../studio-store-types"
import {
  selectResolvedSize,
  selectSizeLabel,
  selectStageDims,
  selectStageInsetLeft,
  selectStageInsetRight,
} from "./select-stage"

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => p,
}))

function s(partial: Partial<StudioStore>): StudioStore {
  return {
    aspectId: "1:1",
    sideLength: 1024,
    controlValues: {},
    followLive: false,
    livePreviewSrc: null,
    pendingPreviewSrc: null,
    advancedOpen: false,
    galleryOpen: false,
    selectedGalleryId: null,
    gallery: [],
    studioTab: "image",
    blueprints: [],
    selectedId: null,
    detail: null,
    ...partial,
  } as StudioStore
}

describe("select-stage", () => {
  it("resolves size labels, stage dims, and insets", () => {
    expect(selectResolvedSize(s({}))).toEqual({ width: 1024, height: 1024 })
    expect(
      selectSizeLabel(s({ controlValues: { width: 512, height: 768 } }))
    ).toBe("512×768")
    expect(selectSizeLabel(s({}))).toBe("1024×1024")

    expect(
      selectStageDims(
        s({
          followLive: true,
          livePreviewSrc: "x",
          controlValues: { width: 640, height: 480 },
        })
      )
    ).toEqual({ width: 640, height: 480 })
    expect(
      selectStageDims(
        s({
          followLive: true,
          pendingPreviewSrc: "x",
          controlValues: {},
        })
      )
    ).toEqual({ width: 1024, height: 1024 })

    const preview: GalleryItem = {
      id: "g1",
      jobId: null,
      path: "a.png",
      thumbnailPath: null,
      metadataJson: JSON.stringify({
        values: { width: 800, height: 600, seed: 1 },
      }),
      createdAt: 0,
    }
    expect(
      selectStageDims(
        s({
          selectedGalleryId: "g1",
          gallery: [preview],
        })
      )
    ).toEqual({ width: 800, height: 600 })
    const badPreview: GalleryItem = {
      ...preview,
      metadataJson: JSON.stringify({ values: { width: 0, height: -1 } }),
    }
    expect(
      selectStageDims(
        s({
          selectedGalleryId: "g1",
          gallery: [badPreview],
        })
      )
    ).toEqual({ width: 1024, height: 1024 })
    expect(
      selectStageDims(
        s({
          controlValues: { width: 320, height: 240 },
        })
      )
    ).toEqual({ width: 320, height: 240 })
    expect(selectStageDims(s({}))).toEqual({ width: 1024, height: 1024 })

    expect(
      selectStageInsetLeft(s({ advancedOpen: true, studioTab: "image" }))
    ).toBe("min(20rem, 40vw)")
    expect(selectStageInsetLeft(s({ advancedOpen: false }))).toBeUndefined()
    expect(
      selectStageInsetRight(s({ galleryOpen: true, studioTab: "image" }))
    ).toBe("min(20rem, 40vw)")
    expect(selectStageInsetRight(s({ galleryOpen: false }))).toBeUndefined()
  })
})
