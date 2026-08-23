import { listUpscalers, usduNodeReady } from "@/lib/host"
import { finishGenerateJob } from "@/lib/generate-lane"
import { useStudioStore } from "@/components/studio/store"

export { finishGenerateJob }

/** Live studio store snapshot (getState), used by host listeners. */
export type Store = ReturnType<typeof useStudioStore.getState>
/** Lazy store read so listeners stay valid across Zustand replacements. */
export type GetStore = () => Store

/** Unlisten fns from `registerHostListeners`; all optional until bound. */
export type HostListenerHandles = {
  unlistenRuntimes?: () => void
  unlistenProgress?: () => void
  unlistenDownload?: () => void
  unlistenDownloadManager?: () => void
  unlistenBlueprintProgress?: () => void
  unlistenBlueprintsUpdated?: () => void
  unlistenBlueprintSizes?: () => void
  unlistenBlueprintProbe?: () => void
  unlistenJobs?: () => void
  unlistenJobProgress?: () => void
  unlistenJobQueue?: () => void
  unlistenGallery?: () => void
  unlistenGalleryDeleted?: () => void
  unlistenLorasUpdated?: () => void
  unlistenLoraProgress?: () => void
  unlistenUpscalersUpdated?: () => void
  unlistenUpscaleProgress?: () => void
  unlistenPromptToolsProgress?: () => void
}

/** Hydrate the upscaler list and USDU readiness; swallows host errors so a missing node never blocks the studio. */
export function refreshUpscaleCatalog(getStore: GetStore) {
  void listUpscalers()
    .then((models) => getStore().setUpscaleModels(models))
    .catch(() => {})
  void usduNodeReady()
    .then((ready) => getStore().setUsduReady(ready))
    .catch(() => {})
}
