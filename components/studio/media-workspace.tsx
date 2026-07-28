"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagesIcon,
  SlidersHorizontalIcon,
} from "lucide-react"
import { useState } from "react"
import { useShallow } from "zustand/react/shallow"
import { AdvancedControls } from "@/components/advanced-controls"
import { AdvancedPanel } from "@/components/advanced-panel"
import { GalleryPanel } from "@/components/gallery-panel"
import { ImageLightbox } from "@/components/image-lightbox"
import { PromptBar } from "@/components/prompt-bar"
import { SideRailHandle } from "@/components/side-rail"
import { StageImage } from "@/components/stage-image"
import {
  selectActiveArch,
  selectActiveLoraStack,
  selectAdvancedControls,
  selectCanGenerate,
  selectHasNegativePrompt,
  selectHasSizeControls,
  selectLatestGallerySeed,
  selectLoraInstallingKey,
  selectPreviewItem,
  selectSelected,
  selectShowAdvancedRail,
  selectShowGalleryRail,
  selectSizeLabel,
  selectStageDims,
  selectStageInsetLeft,
  selectStageInsetRight,
  selectStudioLabel,
  selectSupportsLoras,
  selectTabGallery,
  selectUpscaleInstallingId,
  selectUpscaleQueuedIds,
  selectUpscalePendingIds,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import type { MediaCategory } from "@/lib/host"
import { isRecipeArch } from "@/lib/arch"

type MediaWorkspaceProps = {
  category: MediaCategory
}

export function MediaWorkspace({ category }: MediaWorkspaceProps) {
  // Category is encoded in the route; store derives studioTab from pathname.
  void category

  const canGenerate = useStudioSelector(selectCanGenerate)
  const showAdvancedRail = useStudioSelector(selectShowAdvancedRail)
  const showGalleryRail = useStudioSelector(selectShowGalleryRail)
  const studioLabel = useStudioSelector(selectStudioLabel)
  const studioTab = useStudioStore((s) => s.studioTab)
  const stageInsetLeft = useStudioSelector(selectStageInsetLeft)
  const stageInsetRight = useStudioSelector(selectStageInsetRight)
  const stageDims = useStudioSelector(selectStageDims)
  const livePreviewSrc = useStudioStore((s) => s.livePreviewSrc)
  const pendingPreviewSrc = useStudioStore((s) => s.pendingPreviewSrc)
  const previewItem = useStudioSelector(selectPreviewItem)
  const gallerySrc = useStudioStore((s) => s.gallerySrc)
  const promotePendingPreview = useStudioStore((s) => s.promotePendingPreview)
  const sideRailWidth = useStudioStore((s) => s.SIDE_RAIL_WIDTH)

  const prompt = useStudioStore(
    useShallow((s) => ({
      value: s.prompt,
      setPrompt: s.setPrompt,
      controlValues: s.controlValues,
      setControlValues: s.setControlValues,
      generating: s.generating,
      genStep: s.genStep,
      aspectId: s.aspectId,
      sideLength: s.sideLength,
      applySize: s.applySize,
      handleGenerate: s.handleGenerate,
      handleCancel: s.handleCancel,
      setPickerOpen: s.setPickerOpen,
      openImageToPrompt: s.openImageToPrompt,
      openPromptEnhancer: s.openPromptEnhancer,
    }))
  )
  const hasNegativePrompt = useStudioSelector(selectHasNegativePrompt)
  const hasSizeControls = useStudioSelector(selectHasSizeControls)
  const sizeLabel = useStudioSelector(selectSizeLabel)
  const selected = useStudioSelector(selectSelected)

  const advanced = useStudioStore(
    useShallow((s) => ({
      open: s.advancedOpen,
      setOpen: s.setAdvancedOpen,
      controlValues: s.controlValues,
      setControlValues: s.setControlValues,
      loraPacks: s.loraPacks,
      setLoraStack: s.setLoraStack,
      setLoraPickerOpen: s.setLoraPickerOpen,
      beginLoraInstall: s.beginLoraInstall,
      generating: s.generating,
      isInstalled: s.isInstalled,
      upscaleEnabled: s.upscaleEnabled,
      setUpscaleEnabled: s.setUpscaleEnabled,
      upscaleModelId: s.upscaleModelId,
      setUpscaleModelId: s.setUpscaleModelId,
      usduEnabled: s.usduEnabled,
      setUsduEnabled: s.setUsduEnabled,
      usduScale: s.usduScale,
      setUsduScale: s.setUsduScale,
      usduSteps: s.usduSteps,
      setUsduSteps: s.setUsduSteps,
      usduDenoise: s.usduDenoise,
      setUsduDenoise: s.setUsduDenoise,
      upscaleModels: s.upscaleModels,
      usduReady: s.usduReady,
      beginUpscaleInstall: s.beginUpscaleInstall,
      beginUsduInstall: s.beginUsduInstall,
    }))
  )
  const advancedControls = useStudioSelector(selectAdvancedControls)
  const latestGallerySeed = useStudioSelector(selectLatestGallerySeed)
  const supportsLoras = useStudioSelector(selectSupportsLoras)
  const activeArch = useStudioSelector(selectActiveArch)
  const activeLoraStack = useStudioSelector(selectActiveLoraStack)
  const loraInstallingKey = useStudioSelector(selectLoraInstallingKey)
  const upscaleInstallingId = useStudioSelector(selectUpscaleInstallingId)
  const upscaleQueuedIds = useStudioSelector(selectUpscaleQueuedIds)
  const upscalePendingIds = useStudioSelector(selectUpscalePendingIds)

  const gallery = useStudioStore(
    useShallow((s) => ({
      open: s.galleryOpen,
      setOpen: s.setGalleryOpen,
      selectedId: s.selectedGalleryId,
      setSelectedId: s.setSelectedGalleryId,
      onDelete: s.handleDeleteGalleryItem,
      onReusePrompt: s.handleReuseGalleryPrompt,
      onReuseSettings: s.handleReuseGallerySettings,
      openImageToPrompt: s.openImageToPrompt,
    }))
  )
  const tabGallery = useStudioSelector(selectTabGallery)

  const [lightboxOpen, setLightboxOpen] = useState(false)
  const stageSrc =
    livePreviewSrc ?? (previewItem ? gallerySrc(previewItem.path) : null)

  return (
    <>
      <div
        className="absolute inset-0 flex flex-col pt-14 transition-[left,right] duration-300 ease-out"
        style={{
          left: stageInsetLeft,
          right: stageInsetRight,
        }}
      >
        <main className="relative flex min-h-0 flex-1 items-center justify-center px-5 py-4 md:px-10">
          {livePreviewSrc || pendingPreviewSrc ? (
            <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
              {livePreviewSrc ? (
                <StageImage
                  src={livePreviewSrc}
                  width={stageDims.width}
                  height={stageDims.height}
                  onOpen={() => setLightboxOpen(true)}
                />
              ) : null}
              {pendingPreviewSrc ? (
                <StageImage
                  key={pendingPreviewSrc}
                  src={pendingPreviewSrc}
                  width={stageDims.width}
                  height={stageDims.height}
                  overlay
                  onLoad={() => promotePendingPreview(pendingPreviewSrc)}
                />
              ) : null}
            </div>
          ) : previewItem ? (
            <div className="[container-type:size] relative flex h-full min-h-0 w-full items-center justify-center">
              <StageImage
                src={gallerySrc(previewItem.path)}
                width={stageDims.width}
                height={stageDims.height}
                onOpen={() => setLightboxOpen(true)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_48px_-8px] shadow-primary/40">
                <ImageIcon className="size-9 text-primary" />
              </div>
              <h1 className="font-heading text-4xl font-semibold tracking-tight uppercase md:text-5xl">
                {studioLabel} Studio
              </h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                {canGenerate
                  ? "Local blueprints on your GPU - install a model, describe a scene, generate."
                  : `${studioLabel} blueprints are coming next. Switch to Image to generate now.`}
              </p>
            </div>
          )}
        </main>

        <PromptBar
          prompt={prompt.value}
          onPromptChange={prompt.setPrompt}
          showNegative={hasNegativePrompt}
          negativePrompt={String(prompt.controlValues.negative ?? "")}
          onNegativeChange={(value) =>
            prompt.setControlValues((prev) => ({
              ...prev,
              negative: value,
            }))
          }
          canGenerate={canGenerate}
          studioLabel={studioLabel}
          generating={prompt.generating}
          genStep={prompt.genStep}
          blueprintName={selected?.name ?? null}
          onOpenBlueprintPicker={() => prompt.setPickerOpen(true)}
          hasSizeControls={hasSizeControls}
          aspectId={prompt.aspectId}
          sideLength={prompt.sideLength}
          sizeLabel={sizeLabel}
          onApplySize={prompt.applySize}
          onGenerate={() => void prompt.handleGenerate()}
          onCancel={() => void prompt.handleCancel()}
          onOpenImageToPrompt={() => prompt.openImageToPrompt()}
          onOpenPromptEnhancer={() =>
            prompt.openPromptEnhancer({ prompt: prompt.value })
          }
        />
      </div>

      {showAdvancedRail ? (
        <>
          <SideRailHandle
            side="left"
            open={advanced.open}
            offset={sideRailWidth}
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
                Number(advanced.controlValues.width) || stageDims.width
              }
              refineHeight={
                Number(advanced.controlValues.height) || stageDims.height
              }
            />
          </AdvancedPanel>
        </>
      ) : null}

      {showGalleryRail ? (
        <>
          <SideRailHandle
            side="right"
            open={gallery.open}
            offset={sideRailWidth}
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
            title={`${studioLabel} Gallery`}
            items={tabGallery}
            selectedId={gallery.selectedId}
            onSelect={gallery.setSelectedId}
            onDelete={gallery.onDelete}
            onReusePrompt={gallery.onReusePrompt}
            onReuseSettings={gallery.onReuseSettings}
            onImageToPrompt={(item) =>
              gallery.openImageToPrompt({ imagePath: item.path })
            }
          />
        </>
      ) : null}

      {stageSrc ? (
        <ImageLightbox
          key={stageSrc}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          src={stageSrc}
          onImageToPrompt={
            previewItem
              ? () => gallery.openImageToPrompt({ imagePath: previewItem.path })
              : undefined
          }
        />
      ) : null}
    </>
  )
}
