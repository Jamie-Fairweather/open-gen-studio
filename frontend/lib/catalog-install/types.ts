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

/** Token / gated-terms dialog the install planner must show first. */
export type GateNeed =
  | { type: "hf-token" }
  | { type: "civitai-token" }
  | { type: "gated-terms"; repos: GatedModelRepo[] }

/** Whether the user has a stored HF / Civitai token. */
export type TokenStatus = {
  huggingface: boolean
  civitai: boolean
}

/** Official Blueprint flags that force a token gate before download. */
export type BlueprintGate = {
  requiresHfToken?: boolean
  requiresCivitaiToken?: boolean
}

/** Catalog row plus token / gated-terms state for `planCatalogInstall`. */
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

/** Proceed with the download, or open a gate dialog. */
export type PlanCatalogInstallResult =
  { action: "proceed" } | { action: "gate"; need: GateNeed }

/** Host methods `startCatalogInstall` needs (injectable for tests). */
export type CatalogInstallHost = {
  ensureDownload: (
    spec: DownloadSpec,
    opts?: EnsureOpts
  ) => Promise<EnsureResult>
  installRuntime: () => Promise<unknown>
}

/** Partial store write after a gate dialog is opened or a pending row is stashed. */
export type CatalogGatePatch = {
  pendingInstallId?: string | null
  pendingLoraInstall?: { id: string; arch: RecipeArch } | null
  hfTokenDialogOpen?: boolean
  civitaiTokenDialogOpen?: boolean
  gatedModelDialogOpen?: boolean
  gatedModelRepos?: GatedModelRepo[]
}

/** Download-manager row that may carry a catalog `jobKey`. */
export type JobKeyed = {
  jobKey?: string
}

/** Active + queued jobs used to derive installing / queued catalog ids. */
export type DownloadSnapshotLike = {
  active: JobKeyed | null
  queued: JobKeyed[]
}
