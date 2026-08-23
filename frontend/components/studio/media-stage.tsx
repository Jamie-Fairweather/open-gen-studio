"use client"

import { ImageIcon } from "lucide-react"
import { StageImage } from "@/components/workspace"

/** Center canvas: live generation (with pending crossfade), selected still, or empty hero. */
export function MediaStage({
  showLiveStage,
  livePreviewSrc,
  pendingPreviewSrc,
  previewSrc,
  stageWidth,
  stageHeight,
  studioLabel,
  onOpenLightbox,
  onPromotePending,
}: {
  showLiveStage: boolean
  livePreviewSrc: string | null
  pendingPreviewSrc: string | null
  previewSrc: string | null
  stageWidth: number
  stageHeight: number
  studioLabel: string
  onOpenLightbox: () => void
  onPromotePending: (src: string) => void
}) {
  if (showLiveStage) {
    return (
      <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
        {livePreviewSrc ? (
          <StageImage
            src={livePreviewSrc}
            width={stageWidth}
            height={stageHeight}
            onOpen={onOpenLightbox}
          />
        ) : null}
        {pendingPreviewSrc ? (
          <StageImage
            key={pendingPreviewSrc}
            src={pendingPreviewSrc}
            width={stageWidth}
            height={stageHeight}
            overlay
            onLoad={() => onPromotePending(pendingPreviewSrc)}
          />
        ) : null}
      </div>
    )
  }

  if (previewSrc) {
    return (
      <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
        <StageImage
          src={previewSrc}
          width={stageWidth}
          height={stageHeight}
          onOpen={onOpenLightbox}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_48px_-8px] shadow-primary/40">
        <ImageIcon className="size-9 text-primary" />
      </div>
      <h1 className="font-heading text-4xl font-semibold tracking-tight uppercase md:text-5xl">
        {studioLabel} Studio
      </h1>
    </div>
  )
}
