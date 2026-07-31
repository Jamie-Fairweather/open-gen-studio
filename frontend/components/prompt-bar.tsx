"use client"

import {
  ChevronDownIcon,
  ImageIcon,
  LayersIcon,
  RatioIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import type { CSSProperties } from "react"
import { useShallow } from "zustand/react/shallow"
import {
  selectCanGenerate,
  selectHasNegativePrompt,
  selectHasSizeControls,
  selectSelected,
  selectSizeLabel,
  selectStudioLabel,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { WithTooltip } from "@/components/ui/tooltip"
import {
  ASPECT_RATIOS,
  SIDE_LENGTH_MAX,
  SIDE_LENGTH_MIN,
  SIDE_LENGTH_PRESETS,
  SIDE_LENGTH_STEP,
  type AspectRatio,
} from "@/lib/image-size"
import { cn } from "@/lib/utils"

/** Mini frame for aspect picker tiles (max edge ~14px). */
function aspectFrameStyle(aspect: AspectRatio): CSSProperties {
  const max = 14
  const scale = max / Math.max(aspect.w, aspect.h)
  return {
    width: Math.max(5, Math.round(aspect.w * scale)),
    height: Math.max(5, Math.round(aspect.h * scale)),
  }
}

type PromptBarProps = {
  prompt: string
  onPromptChange: (value: string) => void
  showNegative: boolean
  negativePrompt: string
  onNegativeChange: (value: string) => void
  canGenerate: boolean
  studioLabel: string
  generating: boolean
  genStep: { step: number; max: number } | null
  blueprintName: string | null
  onOpenBlueprintPicker: () => void
  hasSizeControls: boolean
  aspectId: string
  sideLength: number
  sizeLabel: string
  onApplySize: (aspectId: string, sideLength: number) => void
  onGenerate: () => void
  onCancel: () => void
  /** Empty prompt → Image to Prompt; non-empty → Prompt Enhancer. */
  onOpenImageToPrompt?: () => void
  onOpenPromptEnhancer?: () => void
}

export function PromptBar({
  prompt,
  onPromptChange,
  showNegative,
  negativePrompt,
  onNegativeChange,
  canGenerate,
  studioLabel,
  generating,
  genStep,
  blueprintName,
  onOpenBlueprintPicker,
  hasSizeControls,
  aspectId,
  sideLength,
  sizeLabel,
  onApplySize,
  onGenerate,
  onCancel,
  onOpenImageToPrompt,
  onOpenPromptEnhancer,
}: PromptBarProps) {
  const promptEmpty = !prompt.trim()
  const aspectMeta =
    ASPECT_RATIOS.find((a) => a.id === aspectId) ?? ASPECT_RATIOS[0]

  return (
    <div className="pointer-events-none relative z-40 shrink-0 px-4 pt-1 pb-5 md:px-8">
      <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl backdrop-blur-xl">
        <div className="bg-background/50 px-4 pt-3.5 pb-3 md:px-5">
          <textarea
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={
              canGenerate
                ? "Describe the image you want to create."
                : `${studioLabel} generation is not available yet.`
            }
            disabled={!canGenerate}
            rows={1}
            className={cn(
              "field-sizing-content max-h-40 min-h-11 w-full resize-none overflow-y-auto bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60",
              "[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--foreground)_20%,transparent)_transparent]",
              "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent",
              "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20",
              "[&::-webkit-scrollbar-track]:bg-transparent"
            )}
          />
          {showNegative ? (
            <textarea
              value={negativePrompt}
              onChange={(e) => onNegativeChange(e.target.value)}
              placeholder="Negative prompt - what to avoid"
              disabled={!canGenerate}
              rows={2}
              className={cn(
                "mt-2 min-h-10 w-full resize-none overflow-y-auto border-t border-white/8 bg-transparent pt-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-60",
                "[scrollbar-width:thin] [scrollbar-color:color-mix(in_oklab,var(--foreground)_20%,transparent)_transparent]",
                "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/20",
                "[&::-webkit-scrollbar-track]:bg-transparent"
              )}
            />
          ) : null}
        </div>
        {/* Same 1px as the old border - fill grows while sampling. */}
        <div
          className="relative h-px w-full bg-white/8"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={genStep?.max ?? 100}
          aria-valuenow={genStep?.step ?? (generating ? 0 : undefined)}
          aria-label="Generation progress"
        >
          {generating ? (
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300 ease-out"
              style={{
                width: genStep
                  ? `${Math.min(
                      100,
                      (genStep.step / Math.max(genStep.max, 1)) * 100
                    )}%`
                  : "0%",
              }}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={onOpenBlueprintPicker}
            disabled={!canGenerate}
          >
            <LayersIcon className="size-3.5 text-primary" />
            <span className="max-w-[10rem] truncate">
              {blueprintName ?? "Choose blueprint"}
            </span>
            <ChevronDownIcon className="size-3.5 opacity-60" />
          </Button>

          {hasSizeControls ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="rounded-full"
                  />
                }
              >
                <RatioIcon className="size-3.5" />
                <span className="tabular-nums">
                  {aspectMeta.label}
                  <span className="text-muted-foreground"> · {sizeLabel}</span>
                </span>
                <ChevronDownIcon className="size-3.5 opacity-60" />
              </PopoverTrigger>
              <PopoverPopup
                align="start"
                side="top"
                sideOffset={8}
                className="w-[20.5rem]"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xl leading-none font-medium tracking-tight tabular-nums">
                        {sizeLabel}
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground">
                        {aspectMeta.name}
                      </p>
                    </div>
                    <div
                      className="mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/40"
                      aria-hidden
                    >
                      <span
                        className="rounded-[2px] border border-primary bg-primary/15"
                        style={aspectFrameStyle(aspectMeta)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5">
                    {ASPECT_RATIOS.map((aspect) => {
                      const selected = aspect.id === aspectId
                      return (
                        <WithTooltip key={aspect.id} label={aspect.name}>
                          <button
                            type="button"
                            onClick={() => onApplySize(aspect.id, sideLength)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 transition-colors",
                              selected
                                ? "border-primary/50 bg-primary/10 text-foreground"
                                : "border-transparent bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground"
                            )}
                          >
                            <span className="flex h-4 items-center justify-center">
                              <span
                                className={cn(
                                  "rounded-[1.5px] border",
                                  selected
                                    ? "border-primary bg-primary/20"
                                    : "border-current/50 bg-transparent"
                                )}
                                style={aspectFrameStyle(aspect)}
                              />
                            </span>
                            <span className="text-[10px] font-medium tracking-tight">
                              {aspect.label}
                            </span>
                          </button>
                        </WithTooltip>
                      )
                    })}
                  </div>

                  <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Size
                      </span>
                      <span className="font-mono text-xs text-foreground tabular-nums">
                        {sideLength}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {SIDE_LENGTH_PRESETS.map((preset) => {
                        const selected = sideLength === preset
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => onApplySize(aspectId, preset)}
                            className={cn(
                              "rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors",
                              selected
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted/45 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                            )}
                          >
                            {preset}
                          </button>
                        )
                      })}
                    </div>
                    <Slider
                      min={SIDE_LENGTH_MIN}
                      max={SIDE_LENGTH_MAX}
                      step={SIDE_LENGTH_STEP}
                      value={[sideLength]}
                      onValueChange={(value) => {
                        const next = Array.isArray(value) ? value[0] : value
                        if (typeof next === "number") {
                          onApplySize(aspectId, next)
                        }
                      }}
                    />
                  </div>
                </div>
              </PopoverPopup>
            </Popover>
          ) : null}

          <div className="ms-auto flex items-center gap-2">
            {promptEmpty && onOpenImageToPrompt ? (
              <WithTooltip label="Image to Prompt">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={onOpenImageToPrompt}
                  aria-label="Image to Prompt"
                >
                  <ImageIcon className="size-3.5" />
                  <span className="hidden sm:inline">From image</span>
                </Button>
              </WithTooltip>
            ) : null}
            {!promptEmpty && onOpenPromptEnhancer ? (
              <WithTooltip label="Enhance prompt">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={onOpenPromptEnhancer}
                  aria-label="Enhance prompt"
                >
                  <WandSparklesIcon className="size-3.5" />
                  <span className="hidden sm:inline">Enhance</span>
                </Button>
              </WithTooltip>
            ) : null}
            {generating ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="rounded-full px-4 before:hidden"
                onClick={onCancel}
              >
                <XIcon />
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="rounded-full px-5 font-semibold"
              disabled={!canGenerate}
              onClick={onGenerate}
            >
              <SparklesIcon />
              {generating
                ? genStep
                  ? `Queue · ${genStep.step}/${genStep.max}`
                  : "Add to queue"
                : "Generate"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Subscribes to prompt state so keystrokes don't re-render MediaWorkspace. */
export function StudioPromptBar() {
  const canGenerate = useStudioSelector(selectCanGenerate)
  const studioLabel = useStudioSelector(selectStudioLabel)
  const hasNegativePrompt = useStudioSelector(selectHasNegativePrompt)
  const hasSizeControls = useStudioSelector(selectHasSizeControls)
  const sizeLabel = useStudioSelector(selectSizeLabel)
  const selected = useStudioSelector(selectSelected)
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

  return (
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
  )
}
