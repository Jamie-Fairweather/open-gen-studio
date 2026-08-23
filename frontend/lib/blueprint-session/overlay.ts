import type { LoraStackEntry } from "@/lib/host"
import { DEFAULT_UPSCALE_MODEL_ID } from "@/components/studio/slices/setting-keys"

/** Overlay saved control values onto blueprint defaults; only known control ids. */
export function overlayControlValues(
  defaults: Record<string, unknown>,
  saved: Record<string, unknown>,
  controlIds: Iterable<string>
): Record<string, unknown> {
  const allowed = new Set(controlIds)
  const next = { ...defaults }
  for (const [key, value] of Object.entries(saved)) {
    if (allowed.has(key)) next[key] = value
  }
  return next
}

export function overlaySessionControls(
  defaults: Record<string, unknown>,
  session: { controlValues: Record<string, unknown> },
  controlIds: Iterable<string>
): Record<string, unknown> {
  return overlayControlValues(defaults, session.controlValues, controlIds)
}

export function filterSessionLoras(
  stack: LoraStackEntry[],
  knownIds: Set<string>
): LoraStackEntry[] {
  return stack.filter((e) => knownIds.has(e.id))
}

export function resolveSessionUpscaleModelId(
  modelId: string,
  knownIds: Set<string>
): string {
  if (knownIds.has(modelId)) return modelId
  if (knownIds.has(DEFAULT_UPSCALE_MODEL_ID)) return DEFAULT_UPSCALE_MODEL_ID
  return modelId || DEFAULT_UPSCALE_MODEL_ID
}
