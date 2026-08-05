"use client"

import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { Switch } from "@/components/ui/switch"
import type { UpscaleModelInfo } from "@/lib/host"
import { deriveRefineState } from "./refine-derived"
import { RefineModelSelect } from "./refine-model-select"
import { RefineUsduControls } from "./refine-usdu-controls"

type RefineControlsProps = {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  modelId: string
  onModelIdChange: (id: string) => void
  usduEnabled: boolean
  onUsduEnabledChange: (enabled: boolean) => void
  usduScale: 2 | 4
  onUsduScaleChange: (scale: 2 | 4) => void
  usduSteps: number
  onUsduStepsChange: (steps: number) => void
  usduDenoise: number
  onUsduDenoiseChange: (denoise: number) => void
  models: UpscaleModelInfo[]
  usduReady: boolean
  installingId: string | null
  queuedIds: string[]
  pendingIds: string[]
  onInstallModel: (id: string) => void
  onEnsureUsdu: () => void
  width?: number
  height?: number
  disabled?: boolean
  /** Blueprint arch - turbo arches get a stronger USDU caution. */
  arch?: string | null
}

export function RefineControls({
  enabled,
  onEnabledChange,
  modelId,
  onModelIdChange,
  usduEnabled,
  onUsduEnabledChange,
  usduScale,
  onUsduScaleChange,
  usduSteps,
  onUsduStepsChange,
  usduDenoise,
  onUsduDenoiseChange,
  models,
  usduReady,
  installingId,
  queuedIds,
  pendingIds,
  onInstallModel,
  onEnsureUsdu,
  width,
  height,
  disabled,
  arch,
}: RefineControlsProps) {
  const derived = deriveRefineState({
    models,
    modelId,
    usduEnabled,
    usduScale,
    width,
    height,
    arch,
    installingId,
    queuedIds,
    pendingIds,
  })

  return (
    <Frame className="w-full bg-accent/70">
      <FrameHeader className="flex-row items-center justify-between gap-2 px-3 py-2.5">
        <FrameTitle>Refine</FrameTitle>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
          aria-label="Enable upscale"
        />
      </FrameHeader>

      {!enabled ? (
        <FramePanel className="bg-card px-3 py-3">
          <FrameDescription className="text-xs">
            Optional upscale after generate. Pick a model, or add Ultimate SD
            Upscale for tiled diffusion refine.
          </FrameDescription>
        </FramePanel>
      ) : (
        <FramePanel className="bg-card px-3 py-3">
          <div className="flex flex-col gap-3">
            <RefineModelSelect
              models={models}
              selected={derived.selected}
              installingId={installingId}
              queuedIds={queuedIds}
              pendingIds={pendingIds}
              modelInstalling={derived.modelInstalling}
              modelQueued={derived.modelQueued}
              modelBusy={derived.modelBusy}
              disabled={disabled}
              onModelIdChange={onModelIdChange}
              onInstallModel={onInstallModel}
              width={width}
              height={height}
              outW={derived.outW}
              outH={derived.outH}
              isSupir={derived.isSupir}
              usduEnabled={usduEnabled}
              effectiveScale={derived.effectiveScale}
            />

            {derived.isSupir ? (
              <p className="text-[10px] text-muted-foreground">
                SUPIR downloads ~2.5 GB weights plus SDXL base (~7 GB), installs
                a custom node, and needs roughly 12 GB+ VRAM. Non-commercial
                license. Restart Comfy after first install.
              </p>
            ) : (
              <RefineUsduControls
                usduEnabled={usduEnabled}
                onUsduEnabledChange={onUsduEnabledChange}
                usduScale={usduScale}
                onUsduScaleChange={onUsduScaleChange}
                usduSteps={usduSteps}
                onUsduStepsChange={onUsduStepsChange}
                usduDenoise={usduDenoise}
                onUsduDenoiseChange={onUsduDenoiseChange}
                usduReady={usduReady}
                usduInstalling={derived.usduInstalling}
                usduQueued={derived.usduQueued}
                usduBusy={derived.usduBusy}
                turboArch={derived.turboArch}
                guiderUsdu={derived.guiderUsdu}
                disabled={disabled}
                onEnsureUsdu={onEnsureUsdu}
              />
            )}
          </div>
        </FramePanel>
      )}
    </Frame>
  )
}
