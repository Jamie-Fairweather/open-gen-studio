"use client"

import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import { DownloadIcon, PlusIcon, XIcon } from "lucide-react"
import { Fragment, useMemo } from "react"
import { Button } from "@/components/ui/button"
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FrameFooter,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { WithTooltip } from "@/components/ui/tooltip"
import type { LoraPack, LoraStackEntry } from "@/lib/host"

type LoraStackProps = {
  arch: string
  packs: LoraPack[]
  stack: LoraStackEntry[]
  onChange: (next: LoraStackEntry[]) => void
  onInstallVariant: (id: string, arch: RecipeArch) => void
  onOpenLibrary: () => void
  installingKey?: string | null
  queuedKeys?: string[]
  disabled?: boolean
}

function formatStrength(n: number): string {
  const rounded = Math.round(n * 100) / 100
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

/** Generate-panel stack: strength sliders and install for the current arch. */
export function LoraStack({
  arch,
  packs,
  stack,
  onChange,
  onInstallVariant,
  onOpenLibrary,
  installingKey,
  queuedKeys = [],
  disabled,
}: LoraStackProps) {
  const compatible = useMemo(
    () => packs.filter((p) => p.variants.some((v) => v.arch === arch)),
    [packs, arch]
  )

  function packFor(id: string) {
    return packs.find((p) => p.id === id)
  }

  function variantReady(id: string) {
    return packFor(id)?.variants.find((v) => v.arch === arch)?.ready ?? false
  }

  return (
    <Frame className="w-full bg-accent/70">
      <FrameHeader className="flex-row items-center justify-between gap-2 px-3 py-2.5">
        <FrameTitle>LoRAs</FrameTitle>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {stack.length}
        </span>
      </FrameHeader>

      {compatible.length === 0 ? (
        <FramePanel className="bg-card px-3 py-3">
          <FrameDescription className="text-xs">
            No LoRA packs for this architecture.
          </FrameDescription>
        </FramePanel>
      ) : stack.length === 0 ? (
        <FramePanel className="bg-card px-3 py-3">
          <FrameDescription className="text-xs">
            Stack optional packs to steer style and detail.
          </FrameDescription>
        </FramePanel>
      ) : (
        <FramePanel className="bg-card p-0">
          {stack.map((entry, index) => {
            const pack = packFor(entry.id)
            const ready = variantReady(entry.id)
            const min = pack?.strengthMin ?? 0
            const max = pack?.strengthMax ?? 2
            const step = max - min > 4 ? 0.1 : 0.05
            const busy = installingKey === `${entry.id}:${arch}`
            const queued = !busy && queuedKeys.includes(`${entry.id}:${arch}`)
            return (
              <Fragment key={entry.id}>
                {index > 0 ? <Separator /> : null}
                <div className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight text-foreground">
                      {pack?.name ?? entry.id}
                    </p>
                    {ready ? (
                      <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">
                        {formatStrength(entry.strength)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {busy
                          ? "Downloading…"
                          : queued
                            ? "Queued"
                            : "Needs download"}
                      </span>
                    )}
                    <WithTooltip label={`Remove ${pack?.name ?? entry.id}`}>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="size-7 shrink-0 rounded-md p-0 text-muted-foreground hover:text-foreground"
                        disabled={disabled}
                        aria-label={`Remove ${pack?.name ?? entry.id}`}
                        onClick={() =>
                          onChange(stack.filter((s) => s.id !== entry.id))
                        }
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </WithTooltip>
                  </div>

                  {!ready ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-0.5 h-8 w-full rounded-lg text-[11px]"
                      disabled={disabled || busy || queued}
                      onClick={() => {
                        if (!isRecipeArch(arch)) return
                        onInstallVariant(entry.id, arch)
                      }}
                    >
                      <DownloadIcon className="size-3.5" />
                      {busy ? "Downloading…" : queued ? "Queued" : "Install"}
                    </Button>
                  ) : (
                    <Slider
                      className="w-full min-w-0 [&_[data-slot=slider-control]]:min-h-4 [&_[data-slot=slider-control]]:min-w-0! [&_[data-slot=slider-control]]:items-center"
                      min={min}
                      max={max}
                      step={step}
                      disabled={disabled}
                      value={[entry.strength]}
                      onValueChange={(value) => {
                        const next = Array.isArray(value) ? value[0] : value
                        if (typeof next !== "number") return
                        onChange(
                          stack.map((s) =>
                            s.id === entry.id ? { ...s, strength: next } : s
                          )
                        )
                      }}
                    />
                  )}
                </div>
              </Fragment>
            )
          })}
        </FramePanel>
      )}

      {compatible.length > 0 ? (
        <FrameFooter className="p-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 w-full gap-1 rounded-lg text-[11px]"
            disabled={disabled}
            onClick={onOpenLibrary}
          >
            <PlusIcon className="size-3.5" />
            Add LoRA
          </Button>
        </FrameFooter>
      ) : null}
    </Frame>
  )
}
