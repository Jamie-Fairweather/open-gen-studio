import type { ArchDef } from "@/lib/creator-arches"

/** One model-slot draft: role, Comfy folder, filename, and download URL. */
export type ModelDraft = {
  role: string
  path: string
  filename: string
  url: string
}

/** Lowercase kebab-id, trimmed and capped at 64 characters. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

/** Last path segment of a download URL (query/hash stripped). */
export function filenameFromUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    const segment = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
    return decodeURIComponent(segment)
  } catch {
    const noQuery = trimmed.split(/[?#]/)[0]
    const segment = noQuery.split("/").filter(Boolean).pop() ?? ""
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  }
}

/** Page URLs (CivitAI, …) need a backend resolve for the real filename. */
export function needsProviderResolve(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return false
  if (u.includes("civitai.com") || u.includes("civitai.red")) {
    // Direct API download already has a version id - still resolve for filename.
    return true
  }
  const guessed = filenameFromUrl(url)
  return !guessed.includes(".")
}

/** One model-slot draft per arch slot, filename guessed from the default URL. */
export function draftsForArch(arch: ArchDef): ModelDraft[] {
  return arch.slots.map((s) => {
    const url = s.defaultUrl ?? ""
    return {
      role: s.role,
      path: s.path,
      filename: filenameFromUrl(url),
      url,
    }
  })
}
