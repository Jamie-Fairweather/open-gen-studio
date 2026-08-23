import { onRuntimeProgress, onRuntimesUpdated } from "@/lib/host"
import { notifyError, notifyProgress, notifySuccess } from "@/lib/notify"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

/** Bind runtimes-updated and runtime-progress host events; writes runtime status and Comfy health into the store. */
export function registerRuntimeListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onRuntimesUpdated((runtime) => {
    getStore().setRuntimes((prev) => {
      const i = prev.findIndex((x) => x.id === runtime.id)
      if (i === -1) return [runtime, ...prev]
      const next = [...prev]
      next[i] = runtime
      return next
    })
    const runtimeJobActive =
      getStore().downloadSnapshot.active?.kind === "runtime"
    getStore().setRuntimeBusy(
      runtime.status === "installing" ||
        runtime.status === "starting" ||
        runtimeJobActive
    )
    if (runtime.status === "ready") {
      getStore().setComfyHealthy(false)
      if (!runtimeJobActive) {
        getStore().setRuntimeMessage("Runtime ready")
        getStore().setRuntimeBusy(false)
      }
    } else if (runtime.status === "running") {
      getStore().setComfyHealthy(true)
      getStore().setRuntimeMessage("Runtime is running")
      getStore().setRuntimeBusy(false)
      notifyProgress("runtime", "Runtime ready", "Running", true)
    } else if (runtime.status === "error" && runtime.error) {
      notifyError(runtime.error, "Runtime error")
      getStore().setComfyHealthy(false)
      getStore().setRuntimeBusy(false)
    }
  }).then((u) => {
    handles.unlistenRuntimes = u
  })

  void onRuntimeProgress((p) => {
    getStore().setRuntimeMessage(p.message)
    if (p.stage === "done") {
      getStore().setRuntimeBusy(false)
      notifySuccess("Runtime Installed", p.message)
      // Fresh install lands as status "ready" — start it so the studio is warm.
      getStore().maybeAutoStartComfy()
    } else if (p.stage === "ready") {
      getStore().setRuntimeBusy(false)
      getStore().setComfyHealthy(true)
      notifyProgress("runtime", "Runtime ready", p.message, true)
    } else if (p.stage === "error") {
      getStore().setRuntimeBusy(false)
      getStore().setComfyHealthy(false)
      notifyError(p.message, "Runtime error")
    } else if (p.stage === "start") {
      notifyProgress("runtime", "Starting runtime", p.message)
    }
    // extract / configure / download: message only — detail lives on Downloads
  }).then((u) => {
    handles.unlistenProgress = u
  })
}
