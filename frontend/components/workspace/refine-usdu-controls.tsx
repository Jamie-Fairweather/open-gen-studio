"use client"

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { RefineInstallButton } from "./refine-install-button"

export type RefineUsduControlsProps = {
  usduEnabled: boolean
  onUsduEnabledChange: (enabled: boolean) => void
  usduScale: 2 | 4
  onUsduScaleChange: (scale: 2 | 4) => void
  usduSteps: number
  onUsduStepsChange: (steps: number) => void
  usduDenoise: number
  onUsduDenoiseChange: (denoise: number) => void
  usduReady: boolean
  usduInstalling: boolean
  usduQueued: boolean
  usduBusy: boolean
  turboArch: boolean
  guiderUsdu: boolean
  disabled?: boolean
  onEnsureUsdu: () => void
}

export function RefineUsduControls({
  usduEnabled,
  onUsduEnabledChange,
  usduScale,
  onUsduScaleChange,
  usduSteps,
  onUsduStepsChange,
  usduDenoise,
  onUsduDenoiseChange,
  usduReady,
  usduInstalling,
  usduQueued,
  usduBusy,
  turboArch,
  guiderUsdu,
  disabled,
  onEnsureUsdu,
}: RefineUsduControlsProps) {
  const scaleItems = [
    { value: "2", label: "2×" },
    { value: "4", label: "4×" },
  ]
  const scaleValue =
    scaleItems.find((i) => i.value === String(usduScale)) ?? scaleItems[0]

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium tracking-tight">
            Ultimate SD Upscale
          </p>
          <p className="text-[10px] text-muted-foreground">
            {turboArch
              ? "Tiled diffusion refine. Caution with turbo - keep denoise low."
              : "Tiled diffusion refine after enlarge."}
            {!usduReady
              ? usduInstalling
                ? " Downloading…"
                : usduQueued
                  ? " Queued…"
                  : " Node not installed yet."
              : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!usduReady ? (
            <RefineInstallButton
              installing={usduInstalling}
              queued={usduQueued}
              busy={usduBusy}
              disabled={disabled}
              downloadLabel="Install Ultimate SD Upscale node"
              downloadAriaLabel="Install Ultimate SD Upscale"
              queuedAriaLabel="Ultimate SD Upscale queued"
              installingAriaLabel="Downloading Ultimate SD Upscale"
              onInstall={onEnsureUsdu}
            />
          ) : null}
          <Switch
            checked={usduEnabled}
            disabled={disabled}
            onCheckedChange={(next) => {
              onUsduEnabledChange(next)
              if (next && !usduReady) onEnsureUsdu()
            }}
            aria-label="Ultimate SD Upscale"
          />
        </div>
      </div>

      {usduEnabled ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] text-muted-foreground">Scale</span>
            <Select
              items={scaleItems}
              value={scaleValue}
              onValueChange={(item) => {
                if (item?.value === "4") onUsduScaleChange(4)
                else if (item?.value === "2") onUsduScaleChange(2)
              }}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup alignItemWithTrigger={false}>
                {scaleItems.map((item) => (
                  <SelectItem key={item.value} value={item}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>

          {!guiderUsdu ? (
            <>
              <div className="flex w-full flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Steps
                  </span>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {Math.round(usduSteps)}
                  </span>
                </div>
                <Slider
                  className="w-full min-w-0 [&_[data-slot=slider-control]]:min-h-4 [&_[data-slot=slider-control]]:min-w-0! [&_[data-slot=slider-control]]:items-center"
                  aria-label="USDU steps"
                  min={1}
                  max={40}
                  step={1}
                  value={[usduSteps]}
                  disabled={disabled}
                  onValueChange={(nextValue) => {
                    const next = Array.isArray(nextValue)
                      ? nextValue[0]
                      : nextValue
                    if (typeof next !== "number") return
                    onUsduStepsChange(next)
                  }}
                />
              </div>

              <div className="flex w-full flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    Denoise
                  </span>
                  <span className="font-mono text-xs text-foreground tabular-nums">
                    {usduDenoise.toFixed(2)}
                  </span>
                </div>
                <Slider
                  className="w-full min-w-0 [&_[data-slot=slider-control]]:min-h-4 [&_[data-slot=slider-control]]:min-w-0! [&_[data-slot=slider-control]]:items-center"
                  aria-label="USDU denoise"
                  min={0.05}
                  max={0.75}
                  step={0.01}
                  value={[usduDenoise]}
                  disabled={disabled}
                  onValueChange={(nextValue) => {
                    const next = Array.isArray(nextValue)
                      ? nextValue[0]
                      : nextValue
                    if (typeof next !== "number") return
                    onUsduDenoiseChange(next)
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              This arch’s USDU reuses the recipe sampler (Advanced → Steps).
              Separate USDU steps/denoise are not available.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
