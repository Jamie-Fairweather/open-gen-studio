import type { Blueprint, BlueprintDetail, StudioTab } from "@/lib/host"
import { isInstalled } from "@/lib/blueprint-helpers"

/** Mirrors StudioProvider's `tabBlueprints` memo - blueprints scoped to the active tab. */
export function computeTabBlueprints(
  blueprints: Blueprint[],
  studioTab: StudioTab
): Blueprint[] {
  if (
    studioTab === "creator" ||
    studioTab === "downloads" ||
    studioTab === "tools"
  ) {
    return studioTab === "downloads" ? blueprints : []
  }
  return blueprints.filter((bp) => bp.category.toLowerCase() === studioTab)
}

/** Mirrors StudioProvider's `activeSelectedId` - falls back to the first installed blueprint. */
export function computeActiveSelectedId(
  tabBlueprints: Blueprint[],
  selectedId: string | null
): string | null {
  return selectedId && tabBlueprints.some((bp) => bp.id === selectedId)
    ? selectedId
    : (tabBlueprints.find(isInstalled)?.id ?? tabBlueprints[0]?.id ?? null)
}

/** Mirrors StudioProvider's `activeDetail` - only valid when it matches the active selection. */
export function computeActiveDetail(
  detail: BlueprintDetail | null,
  activeSelectedId: string | null
): BlueprintDetail | null {
  return activeSelectedId && detail?.id === activeSelectedId ? detail : null
}
