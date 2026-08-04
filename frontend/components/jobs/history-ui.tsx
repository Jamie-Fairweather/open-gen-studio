"use client"

import { CopyIcon, SlidersHorizontalIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { WithTooltip } from "@/components/ui/tooltip"
import { useStudioStore } from "@/components/studio/store"
import {
  KindGlyph,
  kindLabel,
  statusTone,
} from "@/components/jobs/queue-labels"
import { parseHistoryItem } from "@/components/jobs/history-parse"
import { gallerySrc, parseGalleryRecipe, type JobHistoryItem } from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

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

export function HistoryRow({
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

export function HistoryDetail({ item }: { item: JobHistoryItem }) {
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
