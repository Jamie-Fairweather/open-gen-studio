import { isCivitaiUrl } from "./job-keys"
import type { PlanCatalogInstallInput, PlanCatalogInstallResult } from "./types"

/** Decide proceed vs token/terms gate before starting a Catalog download. */
export async function planCatalogInstall(
  input: PlanCatalogInstallInput
): Promise<PlanCatalogInstallResult> {
  if (input.tokensAlreadyDecided) return { action: "proceed" }

  const { row, tokens } = input

  if (row.kind === "lora") {
    if (isCivitaiUrl(input.loraUrl ?? "") && !tokens.civitai) {
      return { action: "gate", need: { type: "civitai-token" } }
    }
    return { action: "proceed" }
  }

  if (row.kind !== "blueprint") return { action: "proceed" }

  const blueprint = input.blueprint
  if (blueprint?.requiresHfToken && !tokens.huggingface) {
    return { action: "gate", need: { type: "hf-token" } }
  }
  if (blueprint?.requiresCivitaiToken && !tokens.civitai) {
    return { action: "gate", need: { type: "civitai-token" } }
  }
  if (blueprint?.requiresHfToken && !input.gatedTermsAcked) {
    const repos = input.collectGatedRepos
      ? await input.collectGatedRepos(row.id)
      : []
    return { action: "gate", need: { type: "gated-terms", repos } }
  }
  return { action: "proceed" }
}
