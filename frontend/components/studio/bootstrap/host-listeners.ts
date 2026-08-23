import { useStudioStore } from "@/components/studio/store"
import { registerBlueprintListeners } from "@/components/studio/bootstrap/host-listeners-blueprints"
import { registerDownloadListeners } from "@/components/studio/bootstrap/host-listeners-download"
import { registerGalleryListeners } from "@/components/studio/bootstrap/host-listeners-gallery"
import { registerJobListeners } from "@/components/studio/bootstrap/host-listeners-jobs"
import { registerModelListeners } from "@/components/studio/bootstrap/host-listeners-models"
import { registerRuntimeListeners } from "@/components/studio/bootstrap/host-listeners-runtime"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export type { HostListenerHandles } from "@/components/studio/bootstrap/host-listeners-shared"

/** Registers Tauri host event subscriptions; returns async cleanup for all listeners. */
export function registerHostListeners(
  getStore: GetStore = () => useStudioStore.getState()
): HostListenerHandles {
  const handles: HostListenerHandles = {}

  registerBlueprintListeners(handles, getStore)
  registerDownloadListeners(handles, getStore)
  registerRuntimeListeners(handles, getStore)
  registerJobListeners(handles, getStore)
  registerGalleryListeners(handles, getStore)
  registerModelListeners(handles, getStore)

  return handles
}

/** Tear down every host listener stored on the handles object. */
export function cleanupHostListeners(handles: HostListenerHandles) {
  handles.unlistenRuntimes?.()
  handles.unlistenProgress?.()
  handles.unlistenDownload?.()
  handles.unlistenDownloadManager?.()
  handles.unlistenBlueprintProgress?.()
  handles.unlistenBlueprintsUpdated?.()
  handles.unlistenBlueprintSizes?.()
  handles.unlistenBlueprintProbe?.()
  handles.unlistenJobs?.()
  handles.unlistenJobProgress?.()
  handles.unlistenJobQueue?.()
  handles.unlistenGallery?.()
  handles.unlistenGalleryDeleted?.()
  handles.unlistenLorasUpdated?.()
  handles.unlistenLoraProgress?.()
  handles.unlistenUpscalersUpdated?.()
  handles.unlistenUpscaleProgress?.()
  handles.unlistenPromptToolsProgress?.()
}
