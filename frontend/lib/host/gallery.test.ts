import { describe, expect, it, vi } from "vitest"
import type { GalleryItem } from "./types"

const convertFileSrc = vi.fn((p: string) => `asset://${p}`)
const listGalleryCmd = vi.fn(async () => [])
const addGalleryItemCmd = vi.fn(async () => ({ id: "n" }))
const deleteGalleryItemCmd = vi.fn(async () => {})
const revealGalleryItemCmd = vi.fn(async () => "/gallery")
const copyGalleryImageToClipboardCmd = vi.fn(async () => {})

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => convertFileSrc(p),
}))

vi.mock("@/lib/generated/bindings", () => ({
  commands: {
    listGallery: () => listGalleryCmd(),
    addGalleryItem: (
      path: string,
      jobId: string | null,
      thumbnailPath: string | null,
      metadataJson: string | null
    ) => addGalleryItemCmd(path, jobId, thumbnailPath, metadataJson),
    deleteGalleryItem: (id: string) => deleteGalleryItemCmd(id),
    revealGalleryItem: (id: string | null) => revealGalleryItemCmd(id),
    copyGalleryImageToClipboard: (id: string) =>
      copyGalleryImageToClipboardCmd(id),
  },
}))

import {
  addGalleryItem,
  copyGalleryImageToClipboard,
  deleteGalleryItem,
  galleryItemCategory,
  gallerySrc,
  listGallery,
  parseGalleryRecipe,
  revealGalleryItem,
} from "./gallery"

function item(
  partial: Partial<GalleryItem> & Pick<GalleryItem, "path">
): GalleryItem {
  return {
    id: "g1",
    jobId: null,
    thumbnailPath: null,
    metadataJson: "{}",
    createdAt: 0,
    ...partial,
  }
}

describe("parseGalleryRecipe", () => {
  it("parses recipe metadata and returns null for empty/invalid", () => {
    expect(
      parseGalleryRecipe(item({ path: "a.png", metadataJson: "{" }))
    ).toBeNull()
    expect(
      parseGalleryRecipe(item({ path: "a.png", metadataJson: "{}" }))
    ).toBeNull()
    expect(
      parseGalleryRecipe(
        item({
          path: "a.png",
          metadataJson: JSON.stringify({
            blueprintId: "bp",
            blueprintName: "BP",
            category: "VIDEO",
            runtime: "comfy",
            prompt: "hi",
            values: { seed: 1, prompt: "from-values" },
          }),
        })
      )
    ).toEqual({
      blueprintId: "bp",
      blueprintName: "BP",
      category: "video",
      runtime: "comfy",
      prompt: "hi",
      values: { seed: 1, prompt: "from-values" },
    })
    expect(
      parseGalleryRecipe(
        item({
          path: "a.png",
          metadataJson: JSON.stringify({
            values: { prompt: "only-values" },
          }),
        })
      )
    ).toMatchObject({
      blueprintId: null,
      prompt: "only-values",
      category: "image",
    })
    expect(
      parseGalleryRecipe(
        item({
          path: "a.png",
          metadataJson: JSON.stringify({ values: [1, 2] }),
        })
      )
    ).toBeNull()
    expect(
      parseGalleryRecipe(
        item({
          path: "a.png",
          metadataJson: JSON.stringify({ values: { seed: 1 } }),
        })
      )
    ).toMatchObject({ prompt: "", values: { seed: 1 } })
  })
})

describe("galleryItemCategory", () => {
  it("prefers recipe category then extension heuristics", () => {
    expect(
      galleryItemCategory(
        item({
          path: "x.png",
          metadataJson: JSON.stringify({
            category: "audio",
            values: { seed: 1 },
          }),
        })
      )
    ).toBe("audio")
    expect(
      galleryItemCategory(item({ path: "clip.mp4", metadataJson: "{}" }))
    ).toBe("video")
    expect(
      galleryItemCategory(item({ path: "t.wav", metadataJson: "{}" }))
    ).toBe("audio")
    expect(
      galleryItemCategory(item({ path: "p.png", metadataJson: "{}" }))
    ).toBe("image")
  })
})

describe("gallery host wrappers", () => {
  it("delegates to convertFileSrc and commands", async () => {
    expect(gallerySrc("/a.png")).toBe("asset:///a.png")
    await listGallery()
    expect(listGalleryCmd).toHaveBeenCalled()
    await addGalleryItem({ path: "/p" })
    expect(addGalleryItemCmd).toHaveBeenCalledWith("/p", null, null, null)
    await addGalleryItem({
      path: "/p",
      jobId: "j",
      thumbnailPath: "/t",
      metadataJson: "{}",
    })
    expect(addGalleryItemCmd).toHaveBeenCalledWith("/p", "j", "/t", "{}")
    await deleteGalleryItem("id")
    expect(deleteGalleryItemCmd).toHaveBeenCalledWith("id")
    await revealGalleryItem()
    expect(revealGalleryItemCmd).toHaveBeenCalledWith(null)
    await revealGalleryItem("x")
    expect(revealGalleryItemCmd).toHaveBeenCalledWith("x")
    await copyGalleryImageToClipboard("id")
    expect(copyGalleryImageToClipboardCmd).toHaveBeenCalledWith("id")
  })
})
