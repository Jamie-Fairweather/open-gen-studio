"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagesIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import { AdvancedControls } from "@/components/advanced-controls"
import { AdvancedPanel } from "@/components/advanced-panel"
import { GalleryPanel } from "@/components/gallery-panel"
import { PromptBar } from "@/components/prompt-bar"
import { SideRailHandle } from "@/components/side-rail"
import { StageImage } from "@/components/stage-image"
import { useStudio } from "@/components/studio/studio-provider"
import type { MediaCategory } from "@/lib/host"

type MediaWorkspaceProps = {
  category: MediaCategory
}

export function MediaWorkspace({ category }: MediaWorkspaceProps) {
  const s = useStudio()
  // Category is encoded in the route; provider derives studioTab from pathname.
  void category

  const canGenerate = s.canGenerate
  const showAdvancedRail = s.showAdvancedRail
  const showGalleryRail = s.showGalleryRail
  const pendingSrc = s.pendingPreviewSrc

  return (
    <>
      <div
        className="absolute inset-0 flex flex-col pt-14 transition-[left,right] duration-300 ease-out"
        style={{
          left: s.stageInsetLeft,
          right: s.stageInsetRight,
        }}
      >
        <main className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-4 md:px-10">
          {s.livePreviewSrc || s.pendingPreviewSrc ? (
            <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
              {s.livePreviewSrc ? (
                <StageImage
                  src={s.livePreviewSrc}
                  width={s.stageDims.width}
                  height={s.stageDims.height}
                />
              ) : null}
              {pendingSrc ? (
                <StageImage
                  key={pendingSrc}
                  src={pendingSrc}
                  width={s.stageDims.width}
                  height={s.stageDims.height}
                  overlay
                  onLoad={() => s.promotePendingPreview(pendingSrc)}
                />
              ) : null}
            </div>
          ) : s.previewItem ? (
            <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
              <StageImage
                src={s.gallerySrc(s.previewItem.path)}
                width={s.stageDims.width}
                height={s.stageDims.height}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_48px_-8px] shadow-primary/40">
                <ImageIcon className="size-9 text-primary" />
              </div>
              <h1 className="font-heading text-4xl font-semibold tracking-tight uppercase md:text-5xl">
                {s.studioLabel} Studio
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                {canGenerate
                  ? "Local blueprints on your GPU — install a model, describe a scene, generate."
                  : `${s.studioLabel} blueprints are coming next. Switch to Image to generate now.`}
              </p>
            </div>
          )}
        </main>

        <PromptBar
          prompt={s.prompt}
          onPromptChange={s.setPrompt}
          showNegative={s.hasNegativePrompt}
          negativePrompt={String(s.controlValues.negative ?? "")}
          onNegativeChange={(value) =>
            s.setControlValues((prev) => ({
              ...prev,
              negative: value,
            }))
          }
          canGenerate={canGenerate}
          studioLabel={s.studioLabel}
          generating={s.generating}
          genStep={s.genStep}
          blueprintName={s.selected?.name ?? null}
          onOpenBlueprintPicker={() => s.setPickerOpen(true)}
          hasSizeControls={s.hasSizeControls}
          aspectId={s.aspectId}
          sideLength={s.sideLength}
          sizeLabel={s.sizeLabel}
          onApplySize={s.applySize}
          onGenerate={() => void s.handleGenerate()}
          onCancel={() => void s.handleCancel()}
        />
      </div>

      {showAdvancedRail ? (
        <>
          <SideRailHandle
            side="left"
            open={s.advancedOpen}
            offset={s.SIDE_RAIL_WIDTH}
            count={s.activeLoraStack.length}
            icon={<SlidersHorizontalIcon className="size-3.5 opacity-90" />}
            onClick={() => s.setAdvancedOpen((open) => !open)}
            aria-label={s.advancedOpen ? "Close advanced" : "Open advanced"}
            tooltip={s.advancedOpen ? "Close advanced" : "Open advanced"}
          >
            {s.advancedOpen ? (
              <ChevronLeftIcon className="size-4 opacity-70" />
            ) : (
              <ChevronRightIcon className="size-4 opacity-70" />
            )}
          </SideRailHandle>

          <AdvancedPanel open={s.advancedOpen}>
            <AdvancedControls
              controls={s.advancedControls}
              controlValues={s.controlValues}
              setControlValues={s.setControlValues}
              latestGallerySeed={s.latestGallerySeed}
              supportsLoras={s.supportsLoras}
              activeArch={s.activeArch}
              loraPacks={s.loraPacks}
              loraStack={s.activeLoraStack}
              onLoraStackChange={s.setLoraStack}
              loraInstallingKey={s.loraInstallingKey}
              generating={s.generating}
              onOpenLoraLibrary={() => s.setLoraPickerOpen(true)}
              onInstallLoraVariant={(id, arch) => {
                void s.beginLoraInstall(id, arch)
              }}
              showInstallHint={Boolean(
                s.selected && !s.isInstalled(s.selected)
              )}
            />
          </AdvancedPanel>
        </>
      ) : null}

      {showGalleryRail ? (
        <>
          <SideRailHandle
            side="right"
            open={s.galleryOpen}
            offset={s.SIDE_RAIL_WIDTH}
            count={s.tabGallery.length}
            icon={<ImagesIcon className="size-3.5 opacity-90" />}
            onClick={() => s.setGalleryOpen((open) => !open)}
            aria-label={s.galleryOpen ? "Close gallery" : "Open gallery"}
            tooltip={s.galleryOpen ? "Close gallery" : "Open gallery"}
          >
            {s.galleryOpen ? (
              <ChevronRightIcon className="size-4 opacity-70" />
            ) : (
              <ChevronLeftIcon className="size-4 opacity-70" />
            )}
          </SideRailHandle>

          <GalleryPanel
            open={s.galleryOpen}
            title={`${s.studioLabel} Gallery`}
            items={s.tabGallery}
            selectedId={s.selectedGalleryId}
            onSelect={s.setSelectedGalleryId}
            onDelete={s.handleDeleteGalleryItem}
            onReusePrompt={s.handleReuseGalleryPrompt}
            onReuseSettings={s.handleReuseGallerySettings}
          />
        </>
      ) : null}
    </>
  )
}
