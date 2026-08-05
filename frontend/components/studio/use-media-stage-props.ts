"use client"

import { useState } from "react"
import {
  selectPreviewItem,
  selectShowAdvancedRail,
  selectShowGalleryRail,
  selectStageDims,
  selectStageInsetLeft,
  selectStageInsetRight,
  selectStudioLabel,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"

export function useMediaStageProps() {
  const showAdvancedRail = useStudioSelector(selectShowAdvancedRail)
  const showGalleryRail = useStudioSelector(selectShowGalleryRail)
  const studioLabel = useStudioSelector(selectStudioLabel)
  const stageInsetLeft = useStudioSelector(selectStageInsetLeft)
  const stageInsetRight = useStudioSelector(selectStageInsetRight)
  const stageDims = useStudioSelector(selectStageDims)
  const followLive = useStudioStore((s) => s.followLive)
  const livePreviewSrc = useStudioStore((s) => s.livePreviewSrc)
  const pendingPreviewSrc = useStudioStore((s) => s.pendingPreviewSrc)
  const enterFollowLive = useStudioStore((s) => s.enterFollowLive)
  const previewItem = useStudioSelector(selectPreviewItem)
  const gallerySrc = useStudioStore((s) => s.gallerySrc)
  const promotePendingPreview = useStudioStore((s) => s.promotePendingPreview)
  const sideRailWidth = useStudioStore((s) => s.SIDE_RAIL_WIDTH)

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const showLiveStage =
    followLive && Boolean(livePreviewSrc || pendingPreviewSrc)
  const showLiveGhost = Boolean(livePreviewSrc || pendingPreviewSrc)
  const stageSrc = showLiveStage
    ? (livePreviewSrc ?? pendingPreviewSrc)
    : previewItem
      ? gallerySrc(previewItem.path)
      : null

  return {
    showAdvancedRail,
    showGalleryRail,
    studioLabel,
    stageInsetLeft,
    stageInsetRight,
    stageDims,
    followLive,
    livePreviewSrc,
    pendingPreviewSrc,
    enterFollowLive,
    previewItem,
    gallerySrc,
    promotePendingPreview,
    sideRailWidth,
    lightboxOpen,
    setLightboxOpen,
    showLiveStage,
    showLiveGhost,
    stageSrc,
  }
}
