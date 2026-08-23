import type { RecipeArch } from "@/lib/arch"
import type { GatedModelRepo } from "@/lib/hf"
import type { DownloadSpec, EnsureOpts, EnsureResult } from "@/lib/host"

/** A Catalog row the install module can start (or uninstall, where supported). */
export type CatalogRow =
  | { kind: "blueprint"; id: string }
  | { kind: "lora"; id: string; arch: RecipeArch }
  | { kind: "upscale"; id: string }
  | { kind: "promptTools"; provider: string }
  | { kind: "runtime"; engine: string }

export type GateNeed =
  | { type: "hf-token" }
  | { type: "civitai-token" }
  | { type: "gated-terms"; repos: GatedModelRepo[] }

export type TokenStatus = {
  huggingface: boolean
  civitai: boolean
}

export type BlueprintGate = {
  requiresHfToken?: boolean
  requiresCivitaiToken?: boolean
}

export type PlanCatalogInstallInput = {
  row: CatalogRow
  tokens: TokenStatus
  gatedTermsAcked: boolean
  /** First-run already collected or skipped tokens. */
  tokensAlreadyDecided?: boolean
  blueprint?: BlueprintGate | null
  loraUrl?: string
  collectGatedRepos?: (id: string) => Promise<GatedModelRepo[]>
}

export type PlanCatalogInstallResult =
  { action: "proceed" } | { action: "gate"; need: GateNeed }

export type CatalogInstallHost = {
  ensureDownload: (
    spec: DownloadSpec,
    opts?: EnsureOpts
  ) => Promise<EnsureResult>
  installRuntime: () => Promise<unknown>
}

export type CatalogGatePatch = {
  pendingInstallId?: string | null
  pendingLoraInstall?: { id: string; arch: RecipeArch } | null
  hfTokenDialogOpen?: boolean
  civitaiTokenDialogOpen?: boolean
  gatedModelDialogOpen?: boolean
  gatedModelRepos?: GatedModelRepo[]
}

export type JobKeyed = {
  jobKey?: string
}

export type DownloadSnapshotLike = {
  active: JobKeyed | null
  queued: JobKeyed[]
}
