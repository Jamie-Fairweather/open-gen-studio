import type { BlueprintDetail } from "@/lib/host"

/** Build control-value defaults from per-control defaults, then pack overrides. */
export function defaultsFromBlueprintDetail(
  detail: BlueprintDetail
): Record<string, unknown> {
  const controlIds = new Set(detail.controls.map((c) => c.id))
  const next: Record<string, unknown> = {}
  for (const c of detail.controls) {
    if (c.default !== undefined) {
      next[c.id] = c.default
    }
  }
  // Manifest pack defaults win (e.g. Krea 2 Turbo steps/CFG over arch fallbacks).
  const packDefaults = detail.defaults
  if (packDefaults && typeof packDefaults === "object") {
    for (const [key, value] of Object.entries(packDefaults)) {
      if (controlIds.has(key)) next[key] = value
    }
  }
  return next
}
