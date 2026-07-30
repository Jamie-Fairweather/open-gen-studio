import type {
  Blueprint,
  GalleryRecipe,
  LoraPack,
  LoraStackEntry,
  StudioTab,
} from "@/lib/host"
import { defaultUsduDenoise, defaultUsduSteps } from "@/lib/host"

const DEFAULT_UPSCALE_MODEL_ID = "4x-ultrasharp"

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

/** Full gallery reuse: every stored control except prompt/loras/upscale (those are separate state). */
export function applyReuseAllSettings(
  base: Record<string, unknown>,
  recipe: GalleryRecipe
): Record<string, unknown> {
  const next = { ...base }
  for (const [key, value] of Object.entries(recipe.values)) {
    if (key === "prompt" || key === "loras" || key === "upscale") continue
    next[key] = value
  }
  return next
}

/** Refine / USDU settings stored on gallery items as `values.upscale`. */
export type ReusedUpscaleSettings = {
  enabled: boolean
  modelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  usduSteps: number
  usduDenoise: number
}

export function upscaleFromRecipe(
  recipe: GalleryRecipe,
  arch?: string | null
): ReusedUpscaleSettings {
  const raw = recipe.values.upscale
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      enabled: false,
      modelId: DEFAULT_UPSCALE_MODEL_ID,
      usduEnabled: false,
      usduScale: 2,
      usduSteps: defaultUsduSteps(arch),
      usduDenoise: defaultUsduDenoise(arch),
    }
  }
  const row = raw as {
    modelId?: unknown
    usdu?: unknown
    usduScale?: unknown
    usduSteps?: unknown
    usduDenoise?: unknown
  }
  const modelId =
    typeof row.modelId === "string" && row.modelId
      ? row.modelId
      : DEFAULT_UPSCALE_MODEL_ID
  const usduEnabled = row.usdu === true
  const usduScale = row.usduScale === 4 ? 4 : 2
  const stepsRaw = Number(row.usduSteps)
  const denoiseRaw = Number(row.usduDenoise)
  return {
    enabled: true,
    modelId,
    usduEnabled,
    usduScale,
    usduSteps: Number.isFinite(stepsRaw)
      ? Math.min(40, Math.max(1, Math.round(stepsRaw)))
      : defaultUsduSteps(arch),
    usduDenoise: Number.isFinite(denoiseRaw)
      ? Math.min(0.75, Math.max(0.05, denoiseRaw))
      : defaultUsduDenoise(arch),
  }
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
    // Older gallery items only stored resolved filename - map back to pack id.
    if (typeof row.filename === "string" && row.filename) {
      const pack = packs.find((p) =>
        p.variants.some((v) => v.filename === row.filename)
      )
      if (pack) out.push({ id: pack.id, strength })
    }
  }
  return out
}
