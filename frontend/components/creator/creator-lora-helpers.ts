import { RECIPE_ARCHES } from "@/lib/arch"

/** One architecture row in a LoRA pack: arch id and download URL. */
export type VariantRow = {
  key: string
  arch: string
  url: string
}

/** Lowercase kebab-id; strips leading/trailing hyphens. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** True for civitai.com or civitai.red URLs (page or download). */
export function looksLikeCivitai(url: string): boolean {
  const u = url.trim().toLowerCase()
  return u.includes("civitai.com") || u.includes("civitai.red")
}

/** Fresh variant row with a unique key; defaults to the first recipe arch. */
export function newRow(partial?: Partial<VariantRow>): VariantRow {
  return {
    key: crypto.randomUUID(),
    arch: partial?.arch ?? RECIPE_ARCHES[0] ?? "krea2",
    url: partial?.url ?? "",
  }
}
