"use client"

import type { RecipeArch } from "@/lib/arch"
import { DicesIcon, HistoryIcon } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { LoraStack } from "@/components/lora-stack"
import { RefineControls } from "@/components/refine-controls"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field"
import { Slider } from "@/components/ui/slider"
import { WithTooltip } from "@/components/ui/tooltip"
import type {
  BlueprintControl,
  LoraPack,
  LoraStackEntry,
  UpscaleModelInfo,
} from "@/lib/host"
import { notifyInfo, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

type AdvancedControlsProps = {
  controls: BlueprintControl[]
  controlValues: Record<string, unknown>
  setControlValues: Dispatch<SetStateAction<Record<string, unknown>>>
  latestGallerySeed: number | null
  supportsLoras: boolean
  activeArch: string | null
  loraPacks: LoraPack[]
  loraStack: LoraStackEntry[]
  onLoraStackChange: (stack: LoraStackEntry[]) => void
  loraInstallingKey: string | null
  loraQueuedKeys: string[]
  generating: boolean
  onOpenLoraLibrary: () => void
  onInstallLoraVariant: (id: string, arch: RecipeArch) => void
  showInstallHint: boolean
  showRefine: boolean
  upscaleEnabled: boolean
  onUpscaleEnabledChange: (enabled: boolean) => void
  upscaleModelId: string
  onUpscaleModelIdChange: (id: string) => void
  usduEnabled: boolean
  onUsduEnabledChange: (enabled: boolean) => void
  usduScale: 2 | 4
  onUsduScaleChange: (scale: 2 | 4) => void
  usduSteps: number
  onUsduStepsChange: (steps: number) => void
  usduDenoise: number
  onUsduDenoiseChange: (denoise: number) => void
  upscaleModels: UpscaleModelInfo[]
  usduReady: boolean
  upscaleInstallingId: string | null
  upscaleQueuedIds: string[]
  upscalePendingIds: string[]
  onInstallUpscaler: (id: string) => void
  onEnsureUsdu: () => void
  refineWidth?: number
  refineHeight?: number
}

export function AdvancedControls({
  controls,
  controlValues,
  setControlValues,
  latestGallerySeed,
  supportsLoras,
  activeArch,
  loraPacks,
  loraStack,
  onLoraStackChange,
  loraInstallingKey,
  loraQueuedKeys,
  generating,
  onOpenLoraLibrary,
  onInstallLoraVariant,
  showInstallHint,
  showRefine,
  upscaleEnabled,
  onUpscaleEnabledChange,
  upscaleModelId,
  onUpscaleModelIdChange,
  usduEnabled,
  onUsduEnabledChange,
  usduScale,
  onUsduScaleChange,
  usduSteps,
  onUsduStepsChange,
  usduDenoise,
  onUsduDenoiseChange,
  upscaleModels,
  usduReady,
  upscaleInstallingId,
  upscaleQueuedIds,
  upscalePendingIds,
  onInstallUpscaler,
  onEnsureUsdu,
  refineWidth,
  refineHeight,
}: AdvancedControlsProps) {
  const seedControl = controls.find((c) => c.id === "seed")
  const stepsControl = controls.find((c) => c.id === "steps")
  const cfgControl = controls.find(
    (c) => c.id === "cfg" || c.id === "cfg_scale"
  )
  const otherControls = controls.filter(
    (c) =>
      c.id !== "seed" &&
      c.id !== "steps" &&
      c.id !== "cfg" &&
      c.id !== "cfg_scale"
  )

  function renderNumberControl(
    control: BlueprintControl,
    opts?: { stretch?: boolean; isSeed?: boolean }
  ) {
    const value = Number(controlValues[control.id] ?? control.default ?? 0)
    const isSeed = opts?.isSeed ?? control.id === "seed"
    return (
      <label
        key={control.id}
        className={cn(
          "flex flex-col gap-1",
          opts?.stretch ? "w-full" : "min-w-[calc(50%-0.25rem)] flex-1"
        )}
      >
        <span className="text-[10px] text-muted-foreground">
          {isSeed ? "Seed (0 = random)" : control.label || control.id}
        </span>
        <div className="flex items-center gap-1.5">
          {isSeed ? (
            <WithTooltip label="Set to 0 (random each generate)">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="size-8 shrink-0"
                aria-label="Random seed"
                onClick={() =>
                  setControlValues((prev) => ({
                    ...prev,
                    seed: 0,
                  }))
                }
              >
                <DicesIcon className="size-3.5" />
              </Button>
            </WithTooltip>
          ) : null}
          <NumberField
            size="sm"
            className="min-w-0 flex-1 gap-0"
            value={Number.isFinite(value) ? value : 0}
            format={isSeed ? { useGrouping: false } : undefined}
            onValueChange={(v) =>
              setControlValues((prev) => ({
                ...prev,
                [control.id]: v ?? 0,
              }))
            }
          >
            <NumberFieldGroup className="h-8">
              <NumberFieldInput
                className={cn(
                  "h-full! font-mono text-sm leading-none! font-medium tabular-nums sm:h-full!",
                  "text-center!"
                )}
              />
            </NumberFieldGroup>
          </NumberField>
          {isSeed ? (
            <WithTooltip label="Use seed from last gallery image">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="size-8 shrink-0"
                aria-label="Use seed from last gallery image"
                disabled={latestGallerySeed == null}
                onClick={() => {
                  if (latestGallerySeed == null) {
                    notifyInfo("No seed", "Generate an image first.", "seed")
                    return
                  }
                  setControlValues((prev) => ({
                    ...prev,
                    seed: latestGallerySeed,
                  }))
                  notifySuccess("Seed loaded", String(latestGallerySeed))
                }}
              >
                <HistoryIcon className="size-3.5" />
              </Button>
            </WithTooltip>
          ) : null}
        </div>
      </label>
    )
  }

  function renderSliderControl(
    control: BlueprintControl,
    opts: { min: number; max: number; step: number }
  ) {
    const raw = Number(controlValues[control.id] ?? control.default ?? opts.min)
    const value = Number.isFinite(raw)
      ? Math.min(opts.max, Math.max(opts.min, raw))
      : opts.min
    const label = control.label || control.id
    const display =
      opts.step < 1
        ? String(Number(value.toFixed(1)))
        : String(Math.round(value))
    return (
      <div key={control.id} className="flex w-full flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">{label}</span>
          <span className="font-mono text-xs text-foreground tabular-nums">
            {display}
          </span>
        </div>
        <Slider
          className="w-full min-w-0 [&_[data-slot=slider-control]]:min-h-4 [&_[data-slot=slider-control]]:min-w-0! [&_[data-slot=slider-control]]:items-center"
          aria-label={label}
          min={opts.min}
          max={opts.max}
          step={opts.step}
          value={[value]}
          onValueChange={(nextValue) => {
            const next = Array.isArray(nextValue) ? nextValue[0] : nextValue
            if (typeof next !== "number") return
            setControlValues((prev) => ({
              ...prev,
              [control.id]: next,
            }))
          }}
        />
      </div>
    )
  }

  return (
    <>
      {seedControl || stepsControl || cfgControl ? (
        <Frame className="w-full bg-accent/70">
          <FrameHeader className="px-3 py-2.5">
            <FrameTitle>Sampling</FrameTitle>
          </FrameHeader>
          <FramePanel className="bg-card p-3">
            <div className="flex flex-col gap-3">
              {seedControl
                ? renderNumberControl(seedControl, {
                    stretch: true,
                    isSeed: true,
                  })
                : null}
              {stepsControl
                ? renderSliderControl(stepsControl, {
                    min: 1,
                    max: 50,
                    step: 1,
                  })
                : null}
              {cfgControl
                ? renderSliderControl(cfgControl, {
                    min: 1,
                    max: 20,
                    step: 0.5,
                  })
                : null}
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {otherControls.length > 0 ? (
        <Frame className="w-full bg-accent/70">
          <FrameHeader className="px-3 py-2.5">
            <FrameTitle>More</FrameTitle>
          </FrameHeader>
          <FramePanel className="bg-card p-3">
            <div className="flex flex-wrap gap-2">
              {otherControls.map((control) => {
                if (control.type === "number" || control.type === "slider") {
                  return renderNumberControl(control)
                }
                return (
                  <label
                    key={control.id}
                    className="flex w-full flex-col gap-1"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {control.label || control.id}
                    </span>
                    <input
                      className="h-8 w-full rounded-lg border border-input bg-input/32 px-2.5 font-mono text-sm font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24"
                      value={String(controlValues[control.id] ?? "")}
                      onChange={(e) =>
                        setControlValues((prev) => ({
                          ...prev,
                          [control.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                )
              })}
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {showRefine ? (
        <RefineControls
          enabled={upscaleEnabled}
          onEnabledChange={onUpscaleEnabledChange}
          modelId={upscaleModelId}
          onModelIdChange={onUpscaleModelIdChange}
          usduEnabled={usduEnabled}
          onUsduEnabledChange={onUsduEnabledChange}
          usduScale={usduScale}
          onUsduScaleChange={onUsduScaleChange}
          usduSteps={usduSteps}
          onUsduStepsChange={onUsduStepsChange}
          usduDenoise={usduDenoise}
          onUsduDenoiseChange={onUsduDenoiseChange}
          models={upscaleModels}
          usduReady={usduReady}
          installingId={upscaleInstallingId}
          queuedIds={upscaleQueuedIds}
          pendingIds={upscalePendingIds}
          onInstallModel={onInstallUpscaler}
          onEnsureUsdu={onEnsureUsdu}
          width={refineWidth}
          height={refineHeight}
          disabled={generating}
          arch={activeArch}
        />
      ) : null}

      {supportsLoras && activeArch ? (
        <LoraStack
          arch={activeArch}
          packs={loraPacks}
          stack={loraStack}
          onChange={onLoraStackChange}
          installingKey={loraInstallingKey}
          queuedKeys={loraQueuedKeys}
          disabled={generating}
          onOpenLibrary={onOpenLoraLibrary}
          onInstallVariant={onInstallLoraVariant}
        />
      ) : null}

      {controls.length === 0 && !supportsLoras && !showRefine ? (
        <p className="text-xs text-muted-foreground">
          No advanced controls for this blueprint.
        </p>
      ) : null}

      {showInstallHint ? (
        <p className="text-xs text-warning-foreground">
          Models not installed yet. Open the blueprint picker to download.
        </p>
      ) : null}
    </>
  )
}
