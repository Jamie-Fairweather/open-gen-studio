"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
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
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { useStudioStore } from "@/components/studio/store"
import {
  cancelJob,
  clearJobQueue,
  pauseJob,
  reorderJobQueue,
  resumeJob,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

export function JobQueueRail() {
  const jobQueue = useStudioStore((s) => s.jobQueue)
  const setJobQueue = useStudioStore((s) => s.setJobQueue)
  const setGenerating = useStudioStore((s) => s.setGenerating)
  const setActiveJobId = useStudioStore((s) => s.setActiveJobId)
  const setQueueExpandOpen = useStudioStore((s) => s.setQueueExpandOpen)
  const lastQueuedJobId = useStudioStore((s) => s.lastQueuedJobId)
  const genStep = useStudioStore((s) => s.genStep)
  const controlValues = useStudioStore((s) => s.controlValues)
  const stripRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(jobQueue.length)

  const running = jobQueue.find((i) => i.status === "running")
  const waiting = jobQueue.filter((i) => i.status === "queued")
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
  const runningStep =
    running &&
    running.kind === "generate" &&
    genStep &&
    genStep.jobId === running.jobId &&
    genStep.max > 0
      ? `${genStep.step}/${genStep.max}`
      : null

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
  const waitingIds = waiting.map((w) => w.jobId)

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = waitingIds.indexOf(String(active.id))
    const newIndex = waitingIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const nextWaiting = arrayMove(waiting, oldIndex, newIndex)
    const head = jobQueue.filter((i) => i.status !== "queued")
    const next = [...head, ...nextWaiting]
    setJobQueue(next)
    void reorderJobQueue(nextWaiting.map((i) => i.jobId)).catch((e) =>
      notifyError(e instanceof Error ? e.message : String(e))
    )
  }

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
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={waitingIds}
                  strategy={horizontalListSortingStrategy}
                >
                  {visible.map((item) => (
                    <SortableChip
                      key={item.jobId}
                      item={item}
                      stepLabel={
                        item.jobId === running?.jobId ? runningStep : null
                      }
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
                onClick={() => {
                  setJobQueue([])
                  setGenerating(false)
                  setActiveJobId(null)
                  void clearJobQueue()
                    .then(() => notifySuccess("Queue cleared"))
                    .catch((e) =>
                      notifyError(e instanceof Error ? e.message : String(e))
                    )
                }}
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
