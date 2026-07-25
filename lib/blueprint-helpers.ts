import type {
  Blueprint,
  GalleryRecipe,
  LoraPack,
  LoraStackEntry,
  StudioTab,
} from "@/lib/host"

export function isInstalled(bp: Blueprint): boolean {
  return bp.modelCount === 0 || bp.modelsReady >= bp.modelCount
}

export function pickDefaultBlueprintId(
  bps: Blueprint[],
  preferred: string | null | undefined,
  tab: StudioTab = "image"
): string | null {
  if (preferred && bps.some((bp) => bp.id === preferred)) return preferred
  const forTab = bps.filter((bp) => bp.category.toLowerCase() === tab)
  const installed = forTab.find(isInstalled)
  return installed?.id ?? forTab[0]?.id ?? null
}

/** Full gallery reuse: every stored control except prompt/loras (those are separate state). */
export function applyReuseAllSettings(
  base: Record<string, unknown>,
  recipe: GalleryRecipe
): Record<string, unknown> {
  const next = { ...base }
  for (const [key, value] of Object.entries(recipe.values)) {
    if (key === "prompt" || key === "loras") continue
    next[key] = value
  }
  return next
}

export function lorasFromRecipe(
  recipe: GalleryRecipe,
  packs: LoraPack[]
): LoraStackEntry[] {
  const raw = recipe.values.loras
  if (!Array.isArray(raw)) return []
  const out: LoraStackEntry[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue
    const row = entry as {
      id?: unknown
      filename?: unknown
      strength?: unknown
    }
    const strength =
      typeof row.strength === "number" && Number.isFinite(row.strength)
        ? row.strength
        : null
    if (strength == null) continue
    if (typeof row.id === "string" && row.id) {
      out.push({ id: row.id, strength })
      continue
    }
    // Older gallery items only stored resolved filename — map back to pack id.
    if (typeof row.filename === "string" && row.filename) {
      const pack = packs.find((p) =>
        p.variants.some((v) => v.filename === row.filename)
      )
      if (pack) out.push({ id: pack.id, strength })
    }
  }
  return out
}
