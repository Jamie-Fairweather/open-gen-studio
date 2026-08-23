import {
  listLoras,
  onLoraProgress,
  onLorasUpdated,
  onPromptToolsProgress,
  onUpscaleProgress,
  onUpscalersUpdated,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
  refreshUpscaleCatalog,
  type GetStore,
  type HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

/** Bind LoRA, upscaler, and prompt-tools host events; writes catalog state into the store. */
export function registerModelListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onLorasUpdated(() => {
    void listLoras()
      .then((packs) => getStore().setLoraPacks(packs))
      .catch((e) =>
        notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
      )
  }).then((u) => {
    handles.unlistenLorasUpdated = u
  })

  void onUpscalersUpdated(() => {
    refreshUpscaleCatalog(getStore)
  }).then((u) => {
    handles.unlistenUpscalersUpdated = u
  })

  void onUpscaleProgress((p) => {
    const installingRuntime =
      getStore().downloadSnapshot.active?.kind === "runtime" ||
      getStore().runtimes.some(
        (r) => r.engine === "comfyui" && r.status === "installing"
      )
    if (installingRuntime && p.message) {
      getStore().setRuntimeMessage(p.message)
    }
    if (p.stage === "error") {
      notifyError(p.message, "Upscale install failed")
    } else if (p.stage === "done") {
      // Runtime install also pins managed nodes — skip per-node toasts there.
      if (!installingRuntime) {
        notifySuccess(
          p.modelId === "usdu"
            ? "Ultimate SD Upscale ready"
            : p.modelId === "supir"
              ? "SUPIR node ready - restart Comfy if it was running"
              : p.modelId.startsWith("supir-")
                ? "SUPIR weights ready"
                : "Upscale model ready"
        )
      }
      refreshUpscaleCatalog(getStore)
    }
  }).then((u) => {
    handles.unlistenUpscaleProgress = u
  })

  void onPromptToolsProgress((p) => {
    if (p.message) getStore().handlePromptToolsStatus(p.message)
    if (p.stage === "error") {
      notifyError(p.message, "Prompt Tools install failed")
    }
  }).then((u) => {
    handles.unlistenPromptToolsProgress = u
  })

  void onLoraProgress((p) => {
    if (p.stage === "error") {
      notifyError(p.message, "LoRA install failed")
    } else if (p.stage === "done") {
      notifySuccess("LoRA ready", `${p.loraId} · ${p.arch}`)
      void listLoras()
        .then((packs) => getStore().setLoraPacks(packs))
        .catch(() => {})
    }
  }).then((u) => {
    handles.unlistenLoraProgress = u
  })
}
