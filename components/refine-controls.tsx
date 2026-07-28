"use client"

import { ClockIcon, DownloadIcon } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { WithTooltip } from "@/components/ui/tooltip"
import type { UpscaleModelInfo } from "@/lib/host"
import { isRecipeArch } from "@/lib/arch"

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
  const selected = models.find((m) => m.id === modelId) ?? models[0]
  const isSupir = selected?.kind === "supir"
  const modelScale = selected?.scale ?? 4
  const effectiveScale = isSupir
    ? Math.min(modelScale, 2)
    : usduEnabled
      ? usduScale
      : modelScale
  const outW =
    typeof width === "number" && Number.isFinite(width)
      ? Math.round(width * effectiveScale)
      : null
  const outH =
    typeof height === "number" && Number.isFinite(height)
      ? Math.round(height * effectiveScale)
      : null
  const turboArch =
    isRecipeArch(arch ?? "") &&
    (arch === "krea2" ||
      arch === "z-image" ||
      arch === "flux" ||
      arch === "flux2" ||
      arch === "ideogram4")
  const guiderUsdu = arch === "flux2" || arch === "ideogram4"
  const modelInstalling =
    selected != null &&
    (installingId === selected.id ||
      (pendingIds.includes(selected.id) && !queuedIds.includes(selected.id)))
  const modelQueued =
    selected != null &&
    queuedIds.includes(selected.id) &&
    installingId !== selected.id
  const modelBusy = modelInstalling || modelQueued
  const usduInstalling =
    installingId === "usdu" ||
    (pendingIds.includes("usdu") && !queuedIds.includes("usdu"))
  const usduQueued = queuedIds.includes("usdu") && installingId !== "usdu"
  const usduBusy = usduInstalling || usduQueued
  const selectItems = useMemo(
    () =>
      models.map((m) => {
        const tag =
          m.kind === "supir"
            ? "SUPIR"
            : m.name.startsWith("4x Nomos")
              ? "Nomos"
              : null
        const base = tag ? `${m.name} (${tag})` : m.name
        const downloading =
          installingId === m.id ||
          (pendingIds.includes(m.id) && !queuedIds.includes(m.id))
        const queued = queuedIds.includes(m.id) && installingId !== m.id
        const status = m.ready
          ? null
          : downloading
            ? "downloading"
            : queued
              ? "queued"
              : "needs download"
        return {
          value: m.id,
          label: status ? `${base} · ${status}` : base,
        }
      }),
    [models, installingId, queuedIds, pendingIds]
  )
  const selectValue =
    selectItems.find((i) => i.value === selected?.id) ?? selectItems[0] ?? null
  const scaleItems = [
    { value: "2", label: "2×" },
    { value: "4", label: "4×" },
  ]
  const scaleValue =
    scaleItems.find((i) => i.value === String(usduScale)) ?? scaleItems[0]

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
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground">
                Upscale model
              </span>
              <div className="flex items-center gap-1.5">
                <Select
                  items={selectItems}
                  value={selectValue}
                  onValueChange={(item) => {
                    if (item) onModelIdChange(item.value)
                  }}
                  disabled={disabled || models.length === 0}
                >
                  <SelectTrigger size="sm" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    {selectItems.map((item) => (
                      <SelectItem key={item.value} value={item}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {selected && !selected.ready ? (
                  modelInstalling ? (
                    <WithTooltip label="Downloading — see Downloads">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="size-8 shrink-0"
                        disabled
                        aria-label={`Downloading ${selected.name}`}
                      >
                        <Spinner className="size-3.5" />
                      </Button>
                    </WithTooltip>
                  ) : modelQueued ? (
                    <WithTooltip label="Queued in Downloads">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="size-8 shrink-0"
                        disabled
                        aria-label={`${selected.name} queued`}
                      >
                        <ClockIcon className="size-3.5 text-muted-foreground" />
                      </Button>
                    </WithTooltip>
                  ) : (
                    <WithTooltip label={`Download ${selected.name}`}>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        className="size-8 shrink-0"
                        disabled={disabled || modelBusy}
                        aria-label={`Download ${selected.name}`}
                        onClick={() => onInstallModel(selected.id)}
                      >
                        <DownloadIcon className="size-3.5" />
                      </Button>
                    </WithTooltip>
                  )
                ) : null}
              </div>
              {selected?.description ? (
                <span className="text-[10px] text-muted-foreground">
                  {selected.description}
                </span>
              ) : null}
            </label>

            {outW && outH && width && height ? (
              <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {width}×{height} → {outW}×{outH}
                {isSupir
                  ? ` · SUPIR ${effectiveScale}×`
                  : usduEnabled
                    ? ` · USDU ${effectiveScale}×`
                    : ` · SR ${effectiveScale}×`}
              </p>
            ) : null}

            {isSupir ? (
              <p className="text-[10px] text-muted-foreground">
                SUPIR downloads ~2.5 GB weights plus SDXL base (~7 GB), installs
                a custom node, and needs roughly 12 GB+ VRAM. Non-commercial
                license. Restart Comfy after first install.
              </p>
            ) : (
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
                      usduInstalling ? (
                        <WithTooltip label="Downloading — see Downloads">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="size-8 shrink-0"
                            disabled
                            aria-label="Downloading Ultimate SD Upscale"
                          >
                            <Spinner className="size-3.5" />
                          </Button>
                        </WithTooltip>
                      ) : usduQueued ? (
                        <WithTooltip label="Queued in Downloads">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="size-8 shrink-0"
                            disabled
                            aria-label="Ultimate SD Upscale queued"
                          >
                            <ClockIcon className="size-3.5 text-muted-foreground" />
                          </Button>
                        </WithTooltip>
                      ) : (
                        <WithTooltip label="Install Ultimate SD Upscale node">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="size-8 shrink-0"
                            disabled={disabled || usduBusy}
                            aria-label="Install Ultimate SD Upscale"
                            onClick={onEnsureUsdu}
                          >
                            <DownloadIcon className="size-3.5" />
                          </Button>
                        </WithTooltip>
                      )
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
                      <span className="text-[10px] text-muted-foreground">
                        Scale
                      </span>
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
                        This arch’s USDU reuses the recipe sampler (Advanced →
                        Steps). Separate USDU steps/denoise are not available.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </FramePanel>
      )}
    </Frame>
  )
}
