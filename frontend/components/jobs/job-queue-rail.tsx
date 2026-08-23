"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { ExpandIcon, HistoryIcon, Trash2Icon } from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import {
  SortableChip,
  chipWidthPx,
  labelSlotCh,
  statusSlotCh,
} from "@/components/jobs/sortable-chip"
import {
  runningStepLabel,
  useJobQueueActions,
} from "@/components/jobs/use-job-queue-actions"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { useStudioStore } from "@/components/studio/store"
import { cancelJob, pauseJob, resumeJob } from "@/lib/host"
import { notifyError } from "@/lib/notify"

/** Bottom strip of overflow-capped job chips with pause/cancel and expand. */
export function JobQueueRail() {
  const { jobQueue, waitingIds, clearQueue, reorderWaiting } =
    useJobQueueActions()
  const setQueueExpandOpen = useStudioStore((s) => s.setQueueExpandOpen)
  const lastQueuedJobId = useStudioStore((s) => s.lastQueuedJobId)
  const genStep = useStudioStore((s) => s.genStep)
  const controlValues = useStudioStore((s) => s.controlValues)
  const stripRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(jobQueue.length)

  const maxSteps = (() => {
    if (genStep && genStep.max > 0) return genStep.max
    const fromControls = Number(controlValues.steps)
    return Number.isFinite(fromControls) && fromControls > 0
      ? Math.floor(fromControls)
      : 0
  })()
  const statusCh = statusSlotCh(maxSteps)
  const labelCh = labelSlotCh(jobQueue.map((i) => i.label))
  const chipWidth = chipWidthPx(labelCh, statusCh)
  const runningStep = runningStepLabel(jobQueue, genStep)

  const measure = useEffectEvent(() => {
    const el = stripRef.current
    if (!el) return
    const width = el.clientWidth
    // Reserve space for +N control (~40px) and gaps.
    const usable = Math.max(0, width - 48)
    const n = Math.max(1, Math.floor(usable / (chipWidth + 6)))
    setVisibleCount(n)
  })

  useEffect(() => {
    measure()
    const el = stripRef.current
    if (!el) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [jobQueue.length, chipWidth])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const visible = jobQueue.slice(0, visibleCount)
  const overflow = Math.max(0, jobQueue.length - visible.length)

  return (
    <div
      className="relative flex h-10 shrink-0 items-center gap-1.5 border-t border-border bg-popover px-2.5"
      role="region"
      aria-label="Job queue"
    >
      {jobQueue.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center gap-1">
          <p className="text-xs text-muted-foreground">Nothing queued</p>
          <WithTooltip label="Job history">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-7 text-muted-foreground"
              aria-label="Job history"
              onClick={() => setQueueExpandOpen(true)}
            >
              <HistoryIcon className="size-3.5" />
            </Button>
          </WithTooltip>
        </div>
      ) : (
        <>
          <div
            ref={stripRef}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={reorderWaiting}
              >
                <SortableContext
                  items={waitingIds}
                  strategy={horizontalListSortingStrategy}
                >
                  {visible.map((item) => (
                    <SortableChip
                      key={item.jobId}
                      item={item}
                      stepLabel={item.status === "running" ? runningStep : null}
                      chipWidth={chipWidth}
                      statusCh={statusCh}
                      labelCh={labelCh}
                      fresh={item.jobId === lastQueuedJobId}
                      onPause={() =>
                        void pauseJob(item.jobId).catch((e) =>
                          notifyError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                      }
                      onResume={() =>
                        void resumeJob(item.jobId).catch((e) =>
                          notifyError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                      }
                      onCancel={() =>
                        void cancelJob(item.jobId).catch((e) =>
                          notifyError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                      }
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            {overflow > 0 ? (
              <button
                type="button"
                onClick={() => setQueueExpandOpen(true)}
                className="flex h-8 shrink-0 items-center rounded-lg border border-border/50 bg-white/[0.03] px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                +{overflow}
              </button>
            ) : null}
          </div>

          <div className="relative z-10 flex shrink-0 items-center gap-0.5">
            <WithTooltip label="Clear queue">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-7"
                aria-label="Clear queue"
                onClick={clearQueue}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </WithTooltip>
            <WithTooltip label="Open full queue">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-7"
                aria-label="Open full queue"
                onClick={() => setQueueExpandOpen(true)}
              >
                <ExpandIcon className="size-3.5" />
              </Button>
            </WithTooltip>
          </div>
        </>
      )}
    </div>
  )
}
