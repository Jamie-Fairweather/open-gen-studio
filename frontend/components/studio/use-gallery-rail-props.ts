"use client"

import { useShallow } from "zustand/react/shallow"
import { selectTabGallery } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"

/** Gallery-rail store bindings plus the tab-filtered item list. */
export function useGalleryRailProps() {
  const gallery = useStudioStore(
    useShallow((s) => ({
      open: s.galleryOpen,
      setOpen: s.setGalleryOpen,
      selectedId: s.selectedGalleryId,
      selectItem: s.selectGalleryItem,
      onDelete: s.handleDeleteGalleryItem,
      onCopy: s.handleCopyGalleryImage,
      onReveal: s.handleRevealGalleryItem,
      onReusePrompt: s.handleReuseGalleryPrompt,
      onReuseSettings: s.handleReuseGallerySettings,
      openImageToPrompt: s.openImageToPrompt,
    }))
  )
  const tabGallery = useStudioSelector(selectTabGallery)

  return { gallery, tabGallery }
}
