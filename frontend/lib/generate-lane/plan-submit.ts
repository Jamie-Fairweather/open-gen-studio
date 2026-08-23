import type { PlanGenerateSubmitInput, PlanGenerateSubmitResult } from "./types"

/** Gate a Generate click: Catalog ready, Blueprint Installed, prompt present. */
export function planGenerateSubmit(
  input: PlanGenerateSubmitInput
): PlanGenerateSubmitResult {
  if (!input.catalogReady) return { action: "wait-catalog" }
  if (!input.blueprintId) return { action: "pick-blueprint" }
  if (!input.installed && (input.modelsReady ?? 0) < (input.modelCount ?? 1)) {
    return { action: "install-first" }
  }
  if (!input.prompt.trim()) return { action: "need-prompt" }
  return { action: "submit", blueprintId: input.blueprintId }
}
