import {
  listBlueprints,
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
} from "@/lib/host"
import { notifyDismiss, notifyError, notifySuccess } from "@/lib/notify"
import { pickDefaultBlueprintId } from "@/lib/blueprint-helpers"
import { blueprintSession } from "@/lib/blueprint-session/state"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export function registerBlueprintListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onBlueprintProbe((p) => {
    getStore().setSizesProbing(p.stage === "start")
  }).then((u) => {
    handles.unlistenBlueprintProbe = u
  })

  void onBlueprintSizes((bps) => {
    getStore().setBlueprints(bps)
    getStore().setSizesProbing(false)
    getStore().setSelectedId((prev) =>
      pickDefaultBlueprintId(bps, prev ?? blueprintSession.preferredBlueprintId)
    )
  }).then((u) => {
    handles.unlistenBlueprintSizes = u
  })

  void onBlueprintProgress((p) => {
    if (p.stage === "done") {
      notifySuccess("Blueprint ready", p.message)
      return
    }
    if (p.stage === "error") {
      notifyError(p.message, "Blueprint install failed")
      return
    }
    if (p.stage === "cancelled") {
      notifyDismiss("blueprint")
    }
  }).then((u) => {
    handles.unlistenBlueprintProgress = u
  })

  void onBlueprintsUpdated(() => {
    void listBlueprints()
      .then((bps) => getStore().setBlueprints(bps))
      .catch((e) => notifyError(e instanceof Error ? e.message : String(e)))
  }).then((u) => {
    handles.unlistenBlueprintsUpdated = u
  })
}
