import { setSetting } from "@/lib/host"
import { SETTING_SELECTED_BLUEPRINT } from "@/components/studio/slices/setting-keys"
import { blueprintSession } from "./state"

/** Explicit Catalog pick: next detail apply uses pack defaults, not stash. */
export function pickBlueprint(id: string) {
  delete blueprintSession.controlValuesByBlueprintId[id]
  blueprintSession.forceBlueprintDefaults = true
  blueprintSession.pendingSession = null
  blueprintSession.preferredBlueprintId = id
}

export function persistPreferredBlueprint(id: string) {
  void setSetting(SETTING_SELECTED_BLUEPRINT, id).catch(() => {})
}
