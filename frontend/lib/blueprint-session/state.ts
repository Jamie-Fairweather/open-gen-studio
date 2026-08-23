import type { BlueprintDetail, GalleryRecipe } from "@/lib/host"
import type { ImageSessionV1 } from "./types"

/**
 * Blueprint session cycle — pick, pending detail merge, persist gate.
 * Not a second store: Catalog still owns the list; this owns the hydrate.
 */
export const blueprintSession = {
  preferredBlueprintId: null as string | null,
  pendingRecipe: null as GalleryRecipe | null,
  /** Restored image session waiting for Blueprint detail merge. */
  pendingSession: null as ImageSessionV1 | null,
  /**
   * Per-blueprint control values kept across media-tab switches. When the
   * active blueprint falls back to another tab's model, defaults would
   * otherwise wipe seed/etc; returning restores from here.
   */
  controlValuesByBlueprintId: {} as Record<string, Record<string, unknown>>,
  /**
   * Next detail apply should use Blueprint defaults (skip stash / same-id
   * keep). Set by explicit pick (picker / first-run) so steps/CFG match
   * the chosen pack.
   */
  forceBlueprintDefaults: false,
  /**
   * Prefetch of Blueprint detail started during bootstrap before selectedId
   * is set — reused by the detail-load effect to avoid a second round-trip.
   */
  detailPrefetch: null as null | {
    id: string
    promise: Promise<BlueprintDetail>
  },
  /**
   * Skip image-page SQLite writes until bootstrap finishes (and pending
   * session detail merge, when any). Starts true so early pathname effects
   * cannot overwrite a saved image session with empty defaults.
   * Tools persist is not gated by this flag.
   */
  suppressImagePersist: true,
}

export function resetBlueprintSession() {
  blueprintSession.preferredBlueprintId = null
  blueprintSession.pendingRecipe = null
  blueprintSession.pendingSession = null
  blueprintSession.controlValuesByBlueprintId = {}
  blueprintSession.forceBlueprintDefaults = false
  blueprintSession.detailPrefetch = null
  blueprintSession.suppressImagePersist = true
}
