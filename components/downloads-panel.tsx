"use client"

import { DownloadIcon, XIcon } from "lucide-react"
import { useMemo } from "react"
import type {
  BlueprintInstallProgress,
  DownloadModelItem,
} from "@/components/blueprint-picker-dialog"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/studio-panel"
import { Button } from "@/components/ui/button"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { WithTooltip } from "@/components/ui/tooltip"
import { formatBytes, formatDuration } from "@/lib/format"
import { cn } from "@/lib/utils"

export type DownloadHistoryEntry = {
  /** Stable React key — `blueprintId`+`at` can collide when events fire in the same ms. */
  id: string
  blueprintId: string
  name: string
  status: "done" | "error" | "cancelled"
  message: string
  at: number
}

export function makeDownloadHistoryEntry(
  entry: Omit<DownloadHistoryEntry, "id" | "at"> & { at?: number }
): DownloadHistoryEntry {
  return {
    id: crypto.randomUUID(),
    at: entry.at ?? Date.now(),
    blueprintId: entry.blueprintId,
    name: entry.name,
    status: entry.status,
    message: entry.message,
  }
}

/** Prepend a history row; collapse duplicate terminal events for the same id. */
export function pushDownloadHistory(
  prev: DownloadHistoryEntry[],
  entry: Omit<DownloadHistoryEntry, "id" | "at">
): DownloadHistoryEntry[] {
  const next = makeDownloadHistoryEntry(entry)
  if (
    prev[0] &&
    prev[0].blueprintId === next.blueprintId &&
    prev[0].status === next.status &&
    next.at - prev[0].at < 1000
  ) {
    return prev
  }
  return [next, ...prev].slice(0, 12)
}

type DownloadsPanelProps = {
  activeModel: DownloadModelItem | null
  queuedModels: DownloadModelItem[]
  progress: BlueprintInstallProgress | null
  history: DownloadHistoryEntry[]
  onCancel: () => void
  /** Remove a waiting blueprint (and all its queued model rows). */
  onRemoveBlueprint: (blueprintId: string) => void
  onOpenBlueprints?: () => void
}

function statusLabel(status: DownloadHistoryEntry["status"]): string {
  if (status === "done") return "Ready"
  if (status === "error") return "Failed"
  return "Cancelled"
}

function TransferRail({ value, idle }: { value: number; idle?: boolean }) {
  return (
    <div className="relative">
      <Progress value={idle ? 0 : value} className="gap-0">
        <ProgressTrack
          className={cn(
            "h-3 rounded-full bg-white/[0.06]",
            idle && "border border-white/[0.06]"
          )}
        >
          <ProgressIndicator
            className={cn("rounded-full", idle ? "opacity-0" : "duration-300")}
          />
        </ProgressTrack>
      </Progress>
      {idle ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[12%] w-px bg-primary/35"
        />
      ) : null}
    </div>
  )
}

export function DownloadsPanel({
  activeModel,
  queuedModels,
  progress,
  history,
  onCancel,
  onRemoveBlueprint,
  onOpenBlueprints,
}: DownloadsPanelProps) {
  const filePct =
    progress?.total != null && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null
  const barValue = filePct ?? (activeModel ? 0 : null)
  const etaSecs =
    progress &&
    progress.total != null &&
    progress.total > progress.downloaded &&
    progress.bytesPerSec > 8 * 1024
      ? (progress.total - progress.downloaded) / progress.bytesPerSec
      : null

  const hasActive = activeModel != null
  const hasQueued = queuedModels.length > 0
  const empty = !hasActive && !hasQueued && history.length === 0
  const pendingCount = (hasActive ? 1 : 0) + queuedModels.length
  const statusLine = hasActive
    ? hasQueued
      ? `Transferring · ${queuedModels.length} waiting`
      : "Transferring"
    : hasQueued
      ? `${queuedModels.length} waiting`
      : history.length > 0
        ? `${history.length} recent`
        : "Idle"

  const queuedBlueprintIds = useMemo(() => {
    const ids: string[] = []
    for (const item of queuedModels) {
      if (!ids.includes(item.blueprintId)) ids.push(item.blueprintId)
    }
    return ids
  }, [queuedModels])

  return (
    <StudioPanel>
      <StudioPanelHeader
        title="Downloads"
        description={statusLine}
        action={
          onOpenBlueprints ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 before:hidden"
              onClick={onOpenBlueprints}
            >
              <DownloadIcon />
              Blueprints
            </Button>
          ) : undefined
        }
      />

      <StudioPanelBody>
        {empty ? (
          <div className="flex flex-1 flex-col justify-center gap-10 py-6">
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  Transfer
                </p>
                <p className="font-mono text-[11px] text-muted-foreground/70 tabular-nums">
                  0 B / -
                </p>
              </div>
              <TransferRail value={0} idle />
              <p className="font-mono text-[11px] text-muted-foreground/60">
                Waiting for a model download
              </p>
            </div>

            <div className="max-w-md space-y-3">
              <h2 className="text-xl font-medium tracking-tight md:text-2xl">
                Nothing in the queue
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Each missing model becomes its own queue item. Already-present
                files are skipped.
              </p>
              {onOpenBlueprints ? (
                <Button
                  type="button"
                  className="mt-1 rounded-full"
                  onClick={onOpenBlueprints}
                >
                  Choose a blueprint
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 pb-4">
            {hasActive && activeModel ? (
              <li className="overflow-hidden rounded-2xl border border-primary/30 bg-card/80">
                <div className="space-y-4 p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">
                        {activeModel.filename}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Spinner className="size-3.5 text-primary" />
                        {activeModel.blueprintName}
                        {pendingCount > 1
                          ? ` · ${pendingCount} models in queue`
                          : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-full before:hidden"
                      onClick={onCancel}
                    >
                      <XIcon />
                      Cancel
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <TransferRail value={barValue ?? 0} />
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
                      <span>
                        {progress?.total != null
                          ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                          : progress && progress.downloaded > 0
                            ? formatBytes(progress.downloaded)
                            : "Preparing…"}
                      </span>
                      <span className="text-foreground/85">
                        {filePct != null ? `${filePct}%` : "-"}
                        {progress && progress.bytesPerSec > 8 * 1024
                          ? `  ${formatBytes(progress.bytesPerSec)}/s`
                          : ""}
                        {etaSecs != null
                          ? `  ETA ${formatDuration(etaSecs)}`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ) : null}

            {hasQueued ? (
              <li className="pt-2">
                <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  Queue
                </p>
                <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
                  {queuedModels.map((item) => {
                    // Only waiting blueprints can be removed; active install uses Cancel.
                    const showRemove =
                      item.blueprintId !== activeModel?.blueprintId &&
                      queuedBlueprintIds.includes(item.blueprintId)
                    const isFirstOfBlueprint =
                      queuedModels.find(
                        (m) => m.blueprintId === item.blueprintId
                      )?.filename === item.filename
                    return (
                      <li
                        key={`${item.blueprintId}:${item.filename}`}
                        className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-medium">
                            {item.filename}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.blueprintName}
                            {item.role ? ` · ${item.role}` : ""}
                          </p>
                        </div>
                        {showRemove && isFirstOfBlueprint ? (
                          <WithTooltip label="Remove this blueprint from the queue">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="shrink-0 rounded-full before:hidden"
                              onClick={() =>
                                onRemoveBlueprint(item.blueprintId)
                              }
                            >
                              <XIcon />
                              Remove
                            </Button>
                          </WithTooltip>
                        ) : (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            Waiting
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </li>
            ) : null}

            {history.length > 0 ? (
              <li className="pt-2">
                <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  Recent
                </p>
                <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {entry.name}
                        </p>
                        <WithTooltip label={entry.message}>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {entry.message}
                          </p>
                        </WithTooltip>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          entry.status === "done" && "text-primary",
                          entry.status === "error" && "text-destructive",
                          entry.status === "cancelled" &&
                            "text-muted-foreground"
                        )}
                      >
                        {statusLabel(entry.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </ul>
        )}
      </StudioPanelBody>
    </StudioPanel>
  )
}
