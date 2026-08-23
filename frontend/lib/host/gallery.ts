import { convertFileSrc } from "@tauri-apps/api/core"
import { commands } from "@/lib/generated/bindings"
import type { GalleryItem, GalleryRecipe, MediaCategory } from "./types"

/** Category for tab-scoped galleries. Defaults via metadata, then file extension. */
export function galleryItemCategory(item: GalleryItem): MediaCategory {
  const recipe = parseGalleryRecipe(item)
  if (recipe) return recipe.category
  const path = item.path.toLowerCase()
  if (/\.(mp4|webm|mov|mkv)$/i.test(path)) return "video"
  if (/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(path)) return "audio"
  return "image"
}

/** Parse regenerate settings from a gallery item, if present. */
export function parseGalleryRecipe(item: GalleryItem): GalleryRecipe | null {
  try {
    const meta = JSON.parse(item.metadataJson) as {
      blueprintId?: unknown
      blueprintName?: unknown
      category?: unknown
      runtime?: unknown
      prompt?: unknown
      values?: unknown
    }
    const values =
      meta.values &&
      typeof meta.values === "object" &&
      !Array.isArray(meta.values)
        ? { ...(meta.values as Record<string, unknown>) }
        : {}

    const promptFromMeta =
      typeof meta.prompt === "string" ? meta.prompt : undefined
    const promptFromValues =
      typeof values.prompt === "string" ? values.prompt : undefined
    const prompt = promptFromMeta ?? promptFromValues ?? ""

    const categoryRaw =
      typeof meta.category === "string" ? meta.category.toLowerCase() : ""
    const category: MediaCategory =
      categoryRaw === "video" ||
      categoryRaw === "audio" ||
      categoryRaw === "image"
        ? categoryRaw
        : "image"

    const blueprintId =
      typeof meta.blueprintId === "string" && meta.blueprintId
        ? meta.blueprintId
        : null

    if (!blueprintId && !prompt && Object.keys(values).length === 0) {
      return null
    }

    return {
      blueprintId,
      blueprintName:
        typeof meta.blueprintName === "string" ? meta.blueprintName : null,
      category,
      runtime: typeof meta.runtime === "string" ? meta.runtime : null,
      prompt,
      values,
    }
  } catch {
    return null
  }
}

/** Convert a filesystem path to a webview-loadable asset URL (`convertFileSrc`). */
export function gallerySrc(path: string): string {
  return convertFileSrc(path)
}

/** Catalog of saved generations via `list_gallery`. */
export async function listGallery(): Promise<GalleryItem[]> {
  return commands.listGallery()
}

/** Register a file in the gallery via `add_gallery_item`. */
export async function addGalleryItem(input: {
  path: string
  jobId?: string | null
  thumbnailPath?: string | null
  metadataJson?: string
}): Promise<GalleryItem> {
  return commands.addGalleryItem(
    input.path,
    input.jobId ?? null,
    input.thumbnailPath ?? null,
    input.metadataJson ?? null
  )
}

/** Remove a gallery item and its files via `delete_gallery_item`. */
export async function deleteGalleryItem(id: string): Promise<void> {
  await commands.deleteGalleryItem(id)
}

/** Reveal a gallery file, or open the gallery folder when `id` is null/undefined. */
export async function revealGalleryItem(id?: string | null): Promise<string> {
  return commands.revealGalleryItem(id ?? null)
}

/** Copy a gallery image onto the system clipboard via `copy_gallery_image_to_clipboard`. */
export async function copyGalleryImageToClipboard(id: string): Promise<void> {
  await commands.copyGalleryImageToClipboard(id)
}
