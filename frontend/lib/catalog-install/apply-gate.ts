import type { CatalogGatePatch, CatalogRow, GateNeed } from "./types"

/** Map a gate need + pending row onto Catalog dialog / pending-id state. */
export function catalogGatePatch(
  need: GateNeed,
  pending: CatalogRow
): CatalogGatePatch {
  const pendingIds: CatalogGatePatch =
    pending.kind === "blueprint"
      ? { pendingInstallId: pending.id }
      : pending.kind === "lora"
        ? { pendingLoraInstall: { id: pending.id, arch: pending.arch } }
        : {}

  switch (need.type) {
    case "hf-token":
      return { ...pendingIds, hfTokenDialogOpen: true }
    case "civitai-token":
      return { ...pendingIds, civitaiTokenDialogOpen: true }
    case "gated-terms":
      return {
        ...pendingIds,
        gatedModelRepos: need.repos,
        gatedModelDialogOpen: true,
      }
  }
}
