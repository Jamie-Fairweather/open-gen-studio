import { describe, expect, it } from "vitest"
import type { StudioStore } from "../studio-store-types"
import {
  selectCanGenerate,
  selectShowAdvancedRail,
  selectShowCreator,
  selectShowDownloads,
  selectShowGalleryRail,
  selectShowSettings,
  selectShowTools,
  selectStudioLabel,
  selectTabFlags,
} from "./select-tabs"

function s(studioTab: StudioStore["studioTab"]): StudioStore {
  return { studioTab } as StudioStore
}

describe("select-tabs", () => {
  it("derives tab flags and labels", () => {
    expect(selectStudioLabel(s("video"))).toBe("Video")
    expect(selectStudioLabel({ studioTab: "nope" } as StudioStore)).toBe(
      "Image"
    )
    expect(selectCanGenerate(s("image"))).toBe(true)
    expect(selectShowCreator(s("creator"))).toBe(true)
    expect(selectShowDownloads(s("downloads"))).toBe(true)
    expect(selectShowTools(s("tools"))).toBe(true)
    expect(selectShowSettings(s("settings"))).toBe(true)
    expect(selectShowGalleryRail(s("image"))).toBe(true)
    expect(selectShowGalleryRail(s("settings"))).toBe(false)
    expect(selectShowAdvancedRail(s("image"))).toBe(true)
    expect(selectShowAdvancedRail(s("video"))).toBe(false)
    expect(selectTabFlags(s("image"))).toMatchObject({
      canGenerate: true,
      showAdvancedRail: true,
      studioLabel: "Image",
      studioTab: "image",
    })
  })
})
