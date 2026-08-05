import { RECIPE_ARCHES } from "@/lib/arch"

export type VariantRow = {
  key: string
  arch: string
  url: string
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function looksLikeCivitai(url: string): boolean {
  const u = url.trim().toLowerCase()
  return u.includes("civitai.com") || u.includes("civitai.red")
}

export function newRow(partial?: Partial<VariantRow>): VariantRow {
  return {
    key: crypto.randomUUID(),
    arch: partial?.arch ?? RECIPE_ARCHES[0] ?? "krea2",
    url: partial?.url ?? "",
  }
}
