"use client"

import {
  ListOrderedIcon,
  SparklesIcon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import { useStudioStore } from "@/components/studio/store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { WithTooltip } from "@/components/ui/tooltip"
import { cancelJob, type JobQueueItem } from "@/lib/host"
import { cn } from "@/lib/utils"

function KindGlyph({ kind }: { kind: string }) {
  if (kind === "generate") {
    return <SparklesIcon className="size-3.5 text-muted-foreground" />
  }
  return <WandSparklesIcon className="size-3.5 text-muted-foreground" />
}

function kindLabel(kind: string): string {
  if (kind === "generate") return "Generate"
  if (kind === "prompt-tool") return "Prompt Tools"
  return kind
}

function QueueRow({
  item,
  index,
  stepLabel,
}: {
  item: JobQueueItem
  index: number
  stepLabel?: string | null
}) {
  const running = item.status === "running"

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3.5 py-3",
        running && "bg-primary/[0.04]"
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg border",
          running
            ? "border-primary/35 bg-primary/10"
            : "border-border/70 bg-white/[0.03]"
        )}
        aria-hidden
      >
        {running ? (
          <Spinner className="size-3.5 text-primary" />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {index + 1}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">
          {item.label}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <KindGlyph kind={item.kind} />
          <span className="truncate">
            {kindLabel(item.kind)}
            <span className="text-muted-foreground/50"> · </span>
            {running ? (
              <span className="text-primary">
                {stepLabel ? stepLabel : "Running"}
              </span>
            ) : (
              "Waiting"
            )}
          </span>
        </p>
      </div>

      <WithTooltip label={running ? "Cancel job" : "Remove from queue"}>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label={running ? "Cancel job" : "Remove from queue"}
          onClick={() => void cancelJob(item.jobId)}
        >
          <XIcon className="size-3.5" />
        </Button>
      </WithTooltip>
    </li>
  )
}

export function JobQueuePopover() {
  const jobQueue = useStudioStore((s) => s.jobQueue)
  const genStep = useStudioStore((s) => s.genStep)
  const activeJobId = useStudioStore((s) => s.activeJobId)
  const count = jobQueue.length
  const running = jobQueue.find((i) => i.status === "running")
  const waiting = jobQueue.filter((i) => i.status !== "running")

  const runningStep =
    running &&
    running.kind === "generate" &&
    running.jobId === activeJobId &&
    genStep &&
    genStep.max > 0
      ? `${genStep.step}/${genStep.max}`
      : null

  return (
    <Popover>
      <WithTooltip label="Job queue">
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="relative shrink-0"
              aria-label="Job queue"
            />
          }
        >
          <ListOrderedIcon />
          {count > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-medium text-primary-foreground tabular-nums">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </PopoverTrigger>
      </WithTooltip>

      <PopoverPopup align="end" sideOffset={8} className="w-[22rem] p-0">
        <div className="flex items-end justify-between gap-3 border-b border-border/70 px-3.5 pt-3.5 pb-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Queue
            </p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground/80">
              One GPU job at a time
            </p>
          </div>
          <p className="shrink-0 font-mono text-[11px] text-muted-foreground/70 tabular-nums">
            {count === 0 ? "Idle" : `${count} job${count === 1 ? "" : "s"}`}
          </p>
        </div>

        {count === 0 ? (
          <div className="px-3.5 py-8">
            <p className="text-sm font-medium tracking-tight">Nothing queued</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Generate and Prompt Tools share this lane. New jobs wait here
              until the slot frees.
            </p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto p-2">
            {running ? (
              <div className="overflow-hidden rounded-xl border border-primary/30 bg-card/60">
                <ul>
                  <QueueRow item={running} index={0} stepLabel={runningStep} />
                </ul>
              </div>
            ) : null}

            {waiting.length > 0 ? (
              <div className={cn(running && "mt-2")}>
                {running ? (
                  <p className="mb-1.5 px-1.5 font-mono text-[11px] tracking-wide text-muted-foreground/80 uppercase">
                    Waiting
                  </p>
                ) : null}
                <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/40">
                  {waiting.map((item, i) => (
                    <QueueRow
                      key={item.jobId}
                      item={item}
                      index={running ? i + 1 : i}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </PopoverPopup>
    </Popover>
  )
}
