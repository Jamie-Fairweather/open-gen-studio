"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { WithTooltip } from "@/components/ui/tooltip"
import type { JobQueueItem } from "@/lib/host"
import { cn } from "@/lib/utils"
import { statusLabel } from "@/components/jobs/queue-labels"

/** Approx px for icon + gaps + two action buttons + chip padding. */
export const CHIP_CHROME_PX = 12 + 8 + 48 + 12

export function statusSlotCh(maxSteps: number): number {
  const stepSample = maxSteps > 0 ? `${maxSteps}/${maxSteps}` : "0/0"
  return Math.max(
    "Waiting".length,
    "Paused".length,
    "Running".length,
    stepSample.length
  )
}

export function labelSlotCh(labels: string[]): number {
  let longest = 10
  for (const label of labels) {
    if (label.length > longest) longest = label.length
  }
  // Cap so one absurd name doesn't dominate the strip.
  return Math.min(18, longest)
}

export function chipWidthPx(labelCh: number, statusCh: number): number {
  // text-xs ≈ 7px/ch for Outfit; mono status is similar with tabular-nums.
  return Math.round(CHIP_CHROME_PX + labelCh * 7 + statusCh * 7)
}

export function SortableChip({
  item,
  stepLabel,
  chipWidth,
  statusCh,
  labelCh,
  fresh,
  onPause,
  onResume,
  onCancel,
}: {
  item: JobQueueItem
  stepLabel: string | null
  chipWidth: number
  statusCh: number
  labelCh: number
  fresh?: boolean
  onPause: () => void
  onResume: () => void
  onCancel: () => void
}) {
  const running = item.status === "running"
  const paused = item.status === "paused"
  const waiting = item.status === "queued"
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.jobId,
    disabled: !waiting,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        width: chipWidth,
      }}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-card/40 pr-0.5 pl-1.5",
        fresh && "animate-queue-chip-in border-primary/45 bg-primary/[0.06]",
        running && "border-primary/35 bg-primary/[0.04]",
        paused && "border-border/70",
        waiting && "border-border/50",
        isDragging && "z-10 opacity-80 shadow-lg"
      )}
    >
      <div className="flex size-3 shrink-0 items-center justify-center">
        {waiting ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-3" />
          </button>
        ) : running ? (
          <Spinner className="size-3 text-primary" />
        ) : (
          <PauseIcon className="size-3 text-muted-foreground" />
        )}
      </div>

      <p className="flex min-w-0 flex-1 items-baseline gap-1 text-xs tracking-tight">
        <span
          className="truncate font-medium"
          style={{ width: `${labelCh}ch` }}
          title={item.label}
        >
          {item.label}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[11px] leading-none text-muted-foreground tabular-nums",
            running && "text-primary",
            paused && "text-foreground/80"
          )}
          style={{ width: `${statusCh}ch` }}
        >
          {statusLabel(item, stepLabel)}
        </span>
      </p>

      {/* Always two action slots so running↔waiting doesn't shift neighbors. */}
      <div className="flex w-12 shrink-0 items-center justify-end">
        {running ? (
          <WithTooltip label="Pause job">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              aria-label="Pause job"
              onClick={onPause}
            >
              <PauseIcon className="size-3" />
            </Button>
          </WithTooltip>
        ) : paused ? (
          <WithTooltip label="Resume job">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-6"
              aria-label="Resume job"
              onClick={onResume}
            >
              <PlayIcon className="size-3" />
            </Button>
          </WithTooltip>
        ) : (
          <span className="size-6" aria-hidden />
        )}
        <WithTooltip label={running || paused ? "Cancel job" : "Remove"}>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-6 text-muted-foreground hover:text-foreground"
            aria-label={running || paused ? "Cancel job" : "Remove from queue"}
            onClick={onCancel}
          >
            <XIcon className="size-3" />
          </Button>
        </WithTooltip>
      </div>
    </div>
  )
}
