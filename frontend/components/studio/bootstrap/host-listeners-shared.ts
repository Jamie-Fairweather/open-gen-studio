import { listUpscalers, usduNodeReady } from "@/lib/host"
import { useStudioStore } from "@/components/studio/store"

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

export function finishGenerateJob(getStore: GetStore, jobId: string) {
  getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== jobId))
  const stillGenerating = getStore().jobQueue.some(
    (i) => i.kind === "generate" && i.jobId !== jobId
  )
  getStore().setGenerating(stillGenerating)
  getStore().setActiveJobId((id) => (id === jobId ? null : id))
  if (!stillGenerating) getStore().clearLivePreview()
}

export function refreshUpscaleCatalog(getStore: GetStore) {
  void listUpscalers()
    .then((models) => getStore().setUpscaleModels(models))
    .catch(() => {})
  void usduNodeReady()
    .then((ready) => getStore().setUsduReady(ready))
    .catch(() => {})
}
