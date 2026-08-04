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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  CopyIcon,
  ExpandIcon,
  GripVerticalIcon,
  HistoryIcon,
  PauseIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { WithTooltip } from "@/components/ui/tooltip"
import { useStudioStore } from "@/components/studio/store"
import {
  cancelJob,
  clearJobHistory,
  clearJobQueue,
  deleteJobHistoryItem,
  gallerySrc,
  listJobHistory,
  onJobHistory,
  parseGalleryRecipe,
  pauseJob,
  reorderJobQueue,
  resumeJob,
  type JobHistoryItem,
  type JobQueueItem,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

/** Approx px for icon + gaps + two action buttons + chip padding. */
const CHIP_CHROME_PX = 12 + 8 + 48 + 12

function statusSlotCh(maxSteps: number): number {
  const stepSample = maxSteps > 0 ? `${maxSteps}/${maxSteps}` : "0/0"
  return Math.max(
    "Waiting".length,
    "Paused".length,
    "Running".length,
    stepSample.length
  )
}

function labelSlotCh(labels: string[]): number {
  let longest = 10
  for (const label of labels) {
    if (label.length > longest) longest = label.length
  }
  // Cap so one absurd name doesn't dominate the strip.
  return Math.min(18, longest)
}

function chipWidthPx(labelCh: number, statusCh: number): number {
  // text-xs ≈ 7px/ch for Outfit; mono status is similar with tabular-nums.
  return Math.round(CHIP_CHROME_PX + labelCh * 7 + statusCh * 7)
}

function KindGlyph({ kind }: { kind: string }) {
  if (kind === "generate") {
    return <SparklesIcon className="size-3 text-muted-foreground" />
  }
  return <WandSparklesIcon className="size-3 text-muted-foreground" />
}

function kindLabel(kind: string): string {
  if (kind === "generate") return "Generate"
  if (kind === "prompt-tool") return "Prompt Tools"
  return kind
}

function statusLabel(item: JobQueueItem, stepLabel: string | null): string {
  if (item.status === "running") {
    return stepLabel ?? "Running"
  }
  if (item.status === "paused") return "Paused"
  return "Waiting"
}

function SortableChip({
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

type HistoryParsed = {
  thumb: JobHistoryItem["galleryItems"][number] | undefined
  /** Generate prompt, or single tool output when there is no separate input. */
  prompt: string | null
  /** Prompt Enhancer input (original idea). */
  inputPrompt: string | null
  /** Prompt tool output (enhanced / image→prompt). */
  outputPrompt: string | null
  /** Image→Prompt source path from params. */
  inputImagePath: string | null
  isEnhance: boolean
  metaLine: string | null
  sizeLabel: string | null
  seedLabel: string | null
}

const historyParseCache = new Map<string, HistoryParsed>()

function parseHistoryItem(item: JobHistoryItem): HistoryParsed {
  const thumb = item.galleryItems[0]
  const key = `${item.jobId}:${item.updatedAt}:${thumb?.id ?? ""}`
  const cached = historyParseCache.get(key)
  if (cached) return cached

  let prompt: string | null = null
  let inputPrompt: string | null = null
  let outputPrompt: string | null = null
  let inputImagePath: string | null = null
  let isEnhance = false
  let metaLine: string | null = null
  let sizeLabel: string | null = null
  let seedLabel: string | null = null
  try {
    if (thumb?.metadataJson) {
      const meta = JSON.parse(thumb.metadataJson) as {
        prompt?: string
        values?: Record<string, unknown>
      }
      prompt = meta.prompt ?? null
      const w = meta.values?.width
      const h = meta.values?.height
      const seed = meta.values?.seed
      if (w && h) sizeLabel = `${w}×${h}`
      if (seed != null && seed !== "") seedLabel = String(seed)
      metaLine = [sizeLabel, seedLabel ? `seed ${seedLabel}` : null]
        .filter(Boolean)
        .join(" · ")
    } else if (item.kind === "prompt-tool") {
      const params = JSON.parse(item.paramsJson) as {
        prompt?: string
        imagePath?: string
        format?: string
        mode?: string
        result?: { prompt?: string; format?: string }
      }
      const resultPrompt =
        typeof params.result?.prompt === "string" ? params.result.prompt : null
      inputImagePath =
        typeof params.imagePath === "string" && params.imagePath
          ? params.imagePath
          : null
      isEnhance =
        typeof params.prompt === "string" &&
        !inputImagePath &&
        (params.result?.format === "enhance" ||
          params.mode != null ||
          params.format == null)
      if (isEnhance) {
        inputPrompt = params.prompt?.trim() ? params.prompt : null
        outputPrompt = resultPrompt
        prompt = resultPrompt ?? inputPrompt
      } else {
        outputPrompt = resultPrompt
        prompt = resultPrompt
      }
      metaLine = [params.format, params.mode].filter(Boolean).join(" · ")
    }
  } catch {
    /* ignore */
  }
  const parsed = {
    thumb,
    prompt,
    inputPrompt,
    outputPrompt,
    inputImagePath,
    isEnhance,
    metaLine,
    sizeLabel,
    seedLabel,
  }
  if (historyParseCache.size > 2500) historyParseCache.clear()
  historyParseCache.set(key, parsed)
  return parsed
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text).then(
    () => notifySuccess("Copied"),
    () => notifyError("Could not copy")
  )
}

function PromptBlock({
  label,
  text,
  showCopy = true,
}: {
  label: string
  text: string
  showCopy?: boolean
}) {
  return (
    <div className="min-h-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {showCopy ? (
          <WithTooltip label={`Copy ${label.toLowerCase()}`}>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              className="size-7"
              aria-label={`Copy ${label.toLowerCase()}`}
              onClick={() => copyText(text)}
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </WithTooltip>
        ) : null}
      </div>
      <div className="h-40 overflow-hidden rounded-lg border border-border/40 bg-white/[0.03]">
        <ScrollArea className="h-full w-full" scrollFade>
          <p className="px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
            {text}
          </p>
        </ScrollArea>
      </div>
    </div>
  )
}

function statusTone(status: string): string {
  if (status === "completed") return "text-emerald-400"
  if (status === "failed" || status === "cancelled") return "text-destructive"
  return "text-muted-foreground"
}

function HistoryRow({
  item,
  selected,
  onSelect,
  onDelete,
}: {
  item: JobHistoryItem
  selected: boolean
  onSelect: () => void
  onDelete: (shiftKey: boolean) => void
}) {
  const { thumb, metaLine } = parseHistoryItem(item)

  return (
    <li className="[contain-intrinsic-size:auto_52px] [content-visibility:auto]">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSelect()
          }
        }}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors outline-none",
          "hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring",
          selected && "bg-white/[0.06] ring-1 ring-border/80"
        )}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallerySrc(thumb.thumbnailPath ?? thumb.path)}
            alt=""
            className="size-9 shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.04]">
            <KindGlyph kind={item.kind} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="truncate text-sm font-medium tracking-tight">
              {item.label}
            </p>
            <span
              className={cn(
                "shrink-0 text-[11px] capitalize",
                statusTone(item.status)
              )}
            >
              {item.status}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {kindLabel(item.kind)}
            {metaLine ? ` · ${metaLine}` : ""}
          </p>
        </div>
        <WithTooltip label="Remove (Shift+click skips confirm)">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="size-7 shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            aria-label="Remove from history"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(e.shiftKey)
            }}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </WithTooltip>
      </div>
    </li>
  )
}

function HistoryDetail({ item }: { item: JobHistoryItem }) {
  const {
    thumb,
    prompt,
    inputPrompt,
    outputPrompt,
    inputImagePath,
    isEnhance,
    sizeLabel,
    seedLabel,
  } = parseHistoryItem(item)
  const handleReuseGallerySettings = useStudioStore(
    (s) => s.handleReuseGallerySettings
  )
  const setQueueExpandOpen = useStudioStore((s) => s.setQueueExpandOpen)
  const recipe = thumb ? parseGalleryRecipe(thumb) : null
  const canReuseSettings = recipe != null
  const canCopyPrompt = Boolean(prompt?.trim())
  const previewSrc = thumb
    ? gallerySrc(thumb.path)
    : inputImagePath
      ? gallerySrc(inputImagePath)
      : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pe-3">
      {!isEnhance && previewSrc ? (
        <div className="overflow-hidden rounded-xl border border-border/50 bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt=""
            className="mx-auto max-h-[42vh] w-full object-contain"
          />
        </div>
      ) : null}

      <div className="min-w-0 space-y-3">
        <div>
          <p className="text-sm font-medium tracking-tight">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className={cn("capitalize", statusTone(item.status))}>
              {item.status}
            </span>
            <span className="text-muted-foreground/50"> · </span>
            {kindLabel(item.kind)}
            {sizeLabel ? (
              <>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-mono">{sizeLabel}</span>
              </>
            ) : null}
            {seedLabel ? (
              <>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-mono">seed {seedLabel}</span>
              </>
            ) : null}
          </p>
        </div>

        {item.error ? (
          <p className="text-xs text-destructive">{item.error}</p>
        ) : null}

        {thumb && (canCopyPrompt || canReuseSettings) ? (
          <div className="flex flex-wrap gap-1.5">
            {canCopyPrompt ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => copyText(prompt!)}
              >
                <CopyIcon className="size-3.5" />
                Copy prompt
              </Button>
            ) : null}
            {canReuseSettings ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => {
                  handleReuseGallerySettings(thumb)
                  setQueueExpandOpen(false)
                }}
              >
                <SlidersHorizontalIcon className="size-3.5" />
                Reuse all settings
              </Button>
            ) : null}
          </div>
        ) : null}

        {isEnhance ? (
          <div className="space-y-3">
            {inputPrompt ? (
              <PromptBlock label="Input" text={inputPrompt} />
            ) : null}
            {outputPrompt ? (
              <PromptBlock label="Output" text={outputPrompt} />
            ) : (
              <p className="text-xs text-muted-foreground">
                No enhanced prompt stored.
              </p>
            )}
          </div>
        ) : prompt ? (
          <PromptBlock label="Prompt" text={prompt} showCopy={!thumb} />
        ) : (
          <p className="text-xs text-muted-foreground">No prompt stored.</p>
        )}
      </div>
    </div>
  )
}

function SortableActiveRow({
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

export function JobQueueExpandDialog() {
  const open = useStudioStore((s) => s.queueExpandOpen)
  const setOpen = useStudioStore((s) => s.setQueueExpandOpen)
  const jobQueue = useStudioStore((s) => s.jobQueue)
  const setJobQueue = useStudioStore((s) => s.setJobQueue)
  const setGenerating = useStudioStore((s) => s.setGenerating)
  const setActiveJobId = useStudioStore((s) => s.setActiveJobId)
  const genStep = useStudioStore((s) => s.genStep)
  const [history, setHistory] = useState<JobHistoryItem[]>([])
  const [tab, setTab] = useState<"active" | "history">("active")
  const [tabSyncedOpen, setTabSyncedOpen] = useState(open)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string
    clearAll?: boolean
  } | null>(null)
  const historyRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Empty bar opens via the history icon — land on History. Otherwise Active.
  if (open !== tabSyncedOpen) {
    setTabSyncedOpen(open)
    if (open) {
      setTab(jobQueue.length === 0 ? "history" : "active")
    }
  }

  const refreshHistory = useEffectEvent(() => {
    void listJobHistory()
      .then((items) => {
        setHistory(items)
        setSelectedId((prev) => {
          if (prev && items.some((i) => i.jobId === prev)) return prev
          return items[0]?.jobId ?? null
        })
      })
      .catch(() => setHistory([]))
  })

  const scheduleHistoryRefresh = useEffectEvent(() => {
    if (historyRefreshTimer.current) clearTimeout(historyRefreshTimer.current)
    historyRefreshTimer.current = setTimeout(() => {
      historyRefreshTimer.current = null
      refreshHistory()
    }, 120)
  })

  useEffect(() => {
    if (!open) return
    refreshHistory()
    let unlisten: (() => void) | undefined
    void onJobHistory(() => scheduleHistoryRefresh()).then((u) => {
      unlisten = u
    })
    return () => {
      unlisten?.()
      if (historyRefreshTimer.current) {
        clearTimeout(historyRefreshTimer.current)
        historyRefreshTimer.current = null
      }
    }
  }, [open])

  const waiting = jobQueue.filter((i) => i.status === "queued")
  const waitingIds = waiting.map((w) => w.jobId)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const runningStep = (() => {
    const running = jobQueue.find((i) => i.status === "running")
    if (
      running &&
      running.kind === "generate" &&
      genStep &&
      genStep.jobId === running.jobId &&
      genStep.max > 0
    ) {
      return `${genStep.step}/${genStep.max}`
    }
    return null
  })()

  const selected = history.find((h) => h.jobId === selectedId) ?? null
  const purgeableCount = history.filter(
    (h) => h.status === "cancelled" || h.status === "failed"
  ).length

  const deleteHistory = async (id: string, shiftKey: boolean) => {
    const row = history.find((h) => h.jobId === id)
    const hasGallery = (row?.galleryItems.length ?? 0) > 0
    if (hasGallery && !shiftKey) {
      setConfirmDelete({ id })
      return
    }
    try {
      await deleteJobHistoryItem(id, hasGallery)
      setHistory((prev) => {
        const next = prev.filter((h) => h.jobId !== id)
        if (selectedId === id) setSelectedId(next[0]?.jobId ?? null)
        return next
      })
      notifySuccess("Removed from history")
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          className="h-[min(88dvh,820px)] w-[min(92vw,960px)] max-w-[960px] sm:max-w-[960px]"
          showCloseButton
        >
          <DialogHeader className="gap-3 px-5 pt-5 pb-0 sm:px-5">
            <DialogTitle className="sr-only">Job queue</DialogTitle>
            <DialogDescription className="sr-only">
              Active GPU lane and finished job history.
            </DialogDescription>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "active" | "history")}
              className="gap-0"
            >
              <div className="flex items-center justify-between gap-3 pe-10">
                <TabsList variant="underline" className="gap-1">
                  <TabsTab
                    value="active"
                    className="h-8 items-center gap-1.5 px-2.5 text-sm"
                  >
                    <span>Active</span>
                    {jobQueue.length > 0 ? (
                      <span className="text-sm leading-none text-muted-foreground tabular-nums">
                        {jobQueue.length}
                      </span>
                    ) : null}
                  </TabsTab>
                  <TabsTab
                    value="history"
                    className="h-8 items-center gap-1.5 px-2.5 text-sm"
                  >
                    <span>History</span>
                    {history.length > 0 ? (
                      <span className="text-sm leading-none text-muted-foreground tabular-nums">
                        {history.length}
                      </span>
                    ) : null}
                  </TabsTab>
                </TabsList>
                {tab === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground"
                    disabled={jobQueue.length === 0}
                    onClick={() => {
                      setJobQueue([])
                      setGenerating(false)
                      setActiveJobId(null)
                      void clearJobQueue()
                        .then(() => notifySuccess("Queue cleared"))
                        .catch((e) =>
                          notifyError(
                            e instanceof Error ? e.message : String(e)
                          )
                        )
                    }}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </Tabs>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-3 pb-5">
            {tab === "active" ? (
              <ScrollArea className="min-h-0 flex-1" scrollFade>
                {jobQueue.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Queue empty.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const { active, over } = event
                      if (!over || active.id === over.id) return
                      const oldIndex = waitingIds.indexOf(String(active.id))
                      const newIndex = waitingIds.indexOf(String(over.id))
                      if (oldIndex < 0 || newIndex < 0) return
                      const nextWaiting = arrayMove(waiting, oldIndex, newIndex)
                      const head = jobQueue.filter((i) => i.status !== "queued")
                      setJobQueue([...head, ...nextWaiting])
                      void reorderJobQueue(
                        nextWaiting.map((i) => i.jobId)
                      ).catch((e) =>
                        notifyError(e instanceof Error ? e.message : String(e))
                      )
                    }}
                  >
                    <SortableContext
                      items={waitingIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-0.5 pe-2">
                        {jobQueue.map((item, index) => (
                          <SortableActiveRow
                            key={item.jobId}
                            item={item}
                            index={index}
                            total={jobQueue.length}
                            stepLabel={
                              item.status === "running" ? runningStep : null
                            }
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>
            ) : history.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No finished jobs yet.
              </p>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-[minmax(0,1fr)] md:gap-5">
                <div className="flex min-h-0 flex-col gap-2 md:row-span-1">
                  <ScrollArea className="h-full min-h-0 flex-1" scrollFade>
                    <ul className="space-y-0.5 pe-2">
                      {history.map((item) => (
                        <HistoryRow
                          key={item.jobId}
                          item={item}
                          selected={item.jobId === selectedId}
                          onSelect={() => setSelectedId(item.jobId)}
                          onDelete={(shift) =>
                            void deleteHistory(item.jobId, shift)
                          }
                        />
                      ))}
                    </ul>
                  </ScrollArea>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 justify-start px-2 text-muted-foreground"
                    disabled={purgeableCount === 0}
                    onClick={() => setConfirmDelete({ id: "", clearAll: true })}
                  >
                    Purge cancelled & failed
                    {purgeableCount > 0 ? (
                      <span className="text-muted-foreground/80 tabular-nums">
                        · {purgeableCount}
                      </span>
                    ) : null}
                  </Button>
                </div>
                <ScrollArea
                  className="h-full min-h-0 border-t border-border/50 pt-4 md:border-t-0 md:border-l md:ps-5 md:pt-0"
                  scrollFade
                >
                  {selected ? (
                    <HistoryDetail item={selected} />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Select a job.
                    </p>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.clearAll
                ? "Purge cancelled & failed?"
                : "Delete history item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.clearAll
                ? "Removes cancelled and failed jobs from history. Completed jobs stay — delete those one at a time."
                : "This also deletes the linked gallery image. Tip: hold Shift while clicking delete to skip this warning."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                if (!target) return
                void (async () => {
                  try {
                    if (target.clearAll) {
                      await clearJobHistory(true)
                      setHistory((prev) => {
                        const next = prev.filter(
                          (h) =>
                            h.status !== "cancelled" && h.status !== "failed"
                        )
                        setSelectedId((sel) => {
                          if (sel && next.some((h) => h.jobId === sel)) {
                            return sel
                          }
                          return next[0]?.jobId ?? null
                        })
                        return next
                      })
                      notifySuccess("Purged cancelled & failed")
                    } else {
                      await deleteJobHistoryItem(target.id, true)
                      setHistory((prev) => {
                        const next = prev.filter((h) => h.jobId !== target.id)
                        if (selectedId === target.id) {
                          setSelectedId(next[0]?.jobId ?? null)
                        }
                        return next
                      })
                      notifySuccess("Removed from history")
                    }
                  } catch (e) {
                    notifyError(e instanceof Error ? e.message : String(e))
                  }
                })()
              }}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
