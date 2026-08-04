"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVerticalIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { kindLabel, statusLabel } from "@/components/jobs/queue-labels"
import { cancelJob, pauseJob, resumeJob, type JobQueueItem } from "@/lib/host"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

export function SortableActiveRow({
  item,
  index,
  total,
  stepLabel,
}: {
  item: JobQueueItem
  index: number
  total: number
  stepLabel: string | null
}) {
  const waiting = item.status === "queued"
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.jobId, disabled: !waiting })

  const metaLine = [
    kindLabel(item.kind),
    statusLabel(item, stepLabel),
    item.meta,
    total > 1 ? `${index + 1}/${total}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group flex items-start gap-2 rounded-lg px-2 py-2",
        item.status === "running" && "bg-primary/[0.06]",
        item.status === "paused" && "bg-white/[0.03]",
        isDragging && "bg-white/[0.06] opacity-90 shadow-lg"
      )}
    >
      <div className="flex h-5 w-4 shrink-0 items-center justify-center pt-0.5">
        {waiting ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Drag to reorder"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
        ) : item.status === "running" ? (
          <Spinner className="size-3.5 text-primary" />
        ) : (
          <PauseIcon className="size-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">
          {item.label}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
          {metaLine}
        </p>
        {item.prompt ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">
            {item.prompt}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
        {item.status === "running" ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Pause"
            onClick={() =>
              void pauseJob(item.jobId).catch((e) =>
                notifyError(e instanceof Error ? e.message : String(e))
              )
            }
          >
            <PauseIcon className="size-3.5" />
          </Button>
        ) : null}
        {item.status === "paused" ? (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Resume"
            onClick={() =>
              void resumeJob(item.jobId).catch((e) =>
                notifyError(e instanceof Error ? e.message : String(e))
              )
            }
          >
            <PlayIcon className="size-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="opacity-70 group-hover:opacity-100"
          aria-label="Cancel"
          onClick={() =>
            void cancelJob(item.jobId).catch((e) =>
              notifyError(e instanceof Error ? e.message : String(e))
            )
          }
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </li>
  )
}
