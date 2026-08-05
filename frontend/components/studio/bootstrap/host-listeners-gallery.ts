import { onGalleryDeleted, onGalleryUpdated } from "@/lib/host"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export function registerGalleryListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onGalleryUpdated((item) => {
    const s = getStore()
    if (s.gallery.some((x) => x.id === item.id)) {
      s.patchGalleryItem(item)
    } else {
      s.ingestGalleryItem(item)
    }
  }).then((u) => {
    handles.unlistenGallery = u
  })

  void onGalleryDeleted((id) => {
    getStore().setGallery((prev) => prev.filter((item) => item.id !== id))
    getStore().setSelectedGalleryId((current) =>
      current === id ? null : current
    )
  }).then((u) => {
    handles.unlistenGalleryDeleted = u
  })
}
