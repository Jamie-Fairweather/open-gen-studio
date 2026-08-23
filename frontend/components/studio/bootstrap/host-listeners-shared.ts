import { listUpscalers, usduNodeReady } from "@/lib/host"
import { finishGenerateJob } from "@/lib/generate-lane"
import { useStudioStore } from "@/components/studio/store"

export { finishGenerateJob }

export type Store = ReturnType<typeof useStudioStore.getState>
export type GetStore = () => Store

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

export function refreshUpscaleCatalog(getStore: GetStore) {
  void listUpscalers()
    .then((models) => getStore().setUpscaleModels(models))
    .catch(() => {})
  void usduNodeReady()
    .then((ready) => getStore().setUsduReady(ready))
    .catch(() => {})
}
