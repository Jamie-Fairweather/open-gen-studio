"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImagesIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import {
  AdvancedControls,
  AdvancedPanel,
  GalleryPanel,
  ImageLightbox,
  StudioPromptBar,
} from "@/components/workspace"
import { SideRailHandle } from "@/components/shell"
import { MediaStage } from "@/components/studio/media-stage"
import { useAdvancedRailProps } from "@/components/studio/use-advanced-rail-props"
import { useGalleryRailProps } from "@/components/studio/use-gallery-rail-props"
import { useMediaStageProps } from "@/components/studio/use-media-stage-props"
import type { MediaCategory } from "@/lib/host"
import { isRecipeArch } from "@/lib/arch"

type MediaWorkspaceProps = {
  category: MediaCategory
}

/** Stage, prompt bar, and side rails for a media-category route. Category is route-only; tab comes from the store. */
export function MediaWorkspace({ category }: MediaWorkspaceProps) {
  // Category is encoded in the route; store derives studioTab from pathname.
  void category

  const stage = useMediaStageProps()
  const {
    studioTab,
    selected,
    advanced,
    advancedControls,
    latestGallerySeed,
    supportsLoras,
    activeArch,
    activeLoraStack,
    loraInstallingKey,
    loraQueuedKeys,
    upscaleInstallingId,
    upscaleQueuedIds,
    upscalePendingIds,
  } = useAdvancedRailProps()
  const { gallery, tabGallery } = useGalleryRailProps()

  return (
    <>
      <div
        className="absolute inset-0 flex flex-col transition-[left,right] duration-300 ease-out"
        style={{
          left: stage.stageInsetLeft,
          right: stage.stageInsetRight,
        }}
      >
        <main className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-4 md:px-10">
          <MediaStage
            showLiveStage={stage.showLiveStage}
            livePreviewSrc={stage.livePreviewSrc}
            pendingPreviewSrc={stage.pendingPreviewSrc}
            previewSrc={
              stage.previewItem
                ? stage.gallerySrc(stage.previewItem.path)
                : null
            }
            stageWidth={stage.stageDims.width}
            stageHeight={stage.stageDims.height}
            studioLabel={stage.studioLabel}
            onOpenLightbox={() => stage.setLightboxOpen(true)}
            onPromotePending={stage.promotePendingPreview}
          />
        </main>

        <StudioPromptBar />
      </div>

      {stage.showAdvancedRail ? (
        <>
          <SideRailHandle
            side="left"
            open={advanced.open}
            offset={stage.sideRailWidth}
            count={activeLoraStack.length}
            icon={<SlidersHorizontalIcon className="size-3.5 opacity-90" />}
            onClick={() => advanced.setOpen((open) => !open)}
            aria-label={advanced.open ? "Close advanced" : "Open advanced"}
            tooltip={advanced.open ? "Close advanced" : "Open advanced"}
          >
            {advanced.open ? (
              <ChevronLeftIcon className="size-4 opacity-70" />
            ) : (
              <ChevronRightIcon className="size-4 opacity-70" />
            )}
          </SideRailHandle>

          <AdvancedPanel open={advanced.open}>
            <AdvancedControls
              controls={advancedControls}
              controlValues={advanced.controlValues}
              setControlValues={advanced.setControlValues}
              latestGallerySeed={latestGallerySeed}
              supportsLoras={supportsLoras}
              activeArch={activeArch}
              loraPacks={advanced.loraPacks}
              loraStack={activeLoraStack}
              onLoraStackChange={advanced.setLoraStack}
              loraInstallingKey={loraInstallingKey}
              loraQueuedKeys={loraQueuedKeys}
              generating={advanced.generating}
              onOpenLoraLibrary={() => advanced.setLoraPickerOpen(true)}
              onInstallLoraVariant={(id, arch) => {
                if (!isRecipeArch(arch)) return
                void advanced.beginLoraInstall(id, arch)
              }}
              showInstallHint={Boolean(
                selected && !advanced.isInstalled(selected)
              )}
              showRefine={studioTab === "image"}
              upscaleEnabled={advanced.upscaleEnabled}
              onUpscaleEnabledChange={advanced.setUpscaleEnabled}
              upscaleModelId={advanced.upscaleModelId}
              onUpscaleModelIdChange={(id) => {
                advanced.setUpscaleModelId(id)
                const next = advanced.upscaleModels.find((m) => m.id === id)
                if (next?.kind === "supir") advanced.setUsduEnabled(false)
              }}
              usduEnabled={advanced.usduEnabled}
              onUsduEnabledChange={advanced.setUsduEnabled}
              usduScale={advanced.usduScale}
              onUsduScaleChange={advanced.setUsduScale}
              usduSteps={advanced.usduSteps}
              onUsduStepsChange={advanced.setUsduSteps}
              usduDenoise={advanced.usduDenoise}
              onUsduDenoiseChange={advanced.setUsduDenoise}
              upscaleModels={advanced.upscaleModels}
              usduReady={advanced.usduReady}
              upscaleInstallingId={upscaleInstallingId}
              upscaleQueuedIds={upscaleQueuedIds}
              upscalePendingIds={upscalePendingIds}
              onInstallUpscaler={(id) => {
                void advanced.beginUpscaleInstall(id)
              }}
              onEnsureUsdu={() => {
                void advanced.beginUsduInstall()
              }}
              refineWidth={
                Number(advanced.controlValues.width) || stage.stageDims.width
              }
              refineHeight={
                Number(advanced.controlValues.height) || stage.stageDims.height
              }
            />
          </AdvancedPanel>
        </>
      ) : null}

      {stage.showGalleryRail ? (
        <>
          <SideRailHandle
            side="right"
            open={gallery.open}
            offset={stage.sideRailWidth}
            count={tabGallery.length}
            icon={<ImagesIcon className="size-3.5 opacity-90" />}
            onClick={() => gallery.setOpen((open) => !open)}
            aria-label={gallery.open ? "Close gallery" : "Open gallery"}
            tooltip={gallery.open ? "Close gallery" : "Open gallery"}
          >
            {gallery.open ? (
              <ChevronRightIcon className="size-4 opacity-70" />
            ) : (
              <ChevronLeftIcon className="size-4 opacity-70" />
            )}
          </SideRailHandle>

          <GalleryPanel
            open={gallery.open}
            title={`${stage.studioLabel} Gallery`}
            items={tabGallery}
            selectedId={gallery.selectedId}
            onSelect={gallery.selectItem}
            onDelete={gallery.onDelete}
            onCopy={gallery.onCopy}
            onReveal={gallery.onReveal}
            onReusePrompt={gallery.onReusePrompt}
            onReuseSettings={gallery.onReuseSettings}
            onImageToPrompt={(item) =>
              gallery.openImageToPrompt({ imagePath: item.path })
            }
            showLive={stage.showLiveGhost}
            livePreviewSrc={stage.livePreviewSrc ?? stage.pendingPreviewSrc}
            followLive={stage.followLive}
            onSelectLive={() => {
              if (stage.followLive) {
                gallery.selectItem(gallery.selectedId)
              } else {
                stage.enterFollowLive()
              }
            }}
          />
        </>
      ) : null}

      {stage.stageSrc ? (
        <ImageLightbox
          key={stage.stageSrc}
          open={stage.lightboxOpen}
          onOpenChange={stage.setLightboxOpen}
          src={stage.stageSrc}
          onImageToPrompt={
            !stage.showLiveStage && stage.previewItem
              ? () =>
                  gallery.openImageToPrompt({
                    imagePath: stage.previewItem!.path,
                  })
              : undefined
          }
        />
      ) : null}
    </>
  )
}
