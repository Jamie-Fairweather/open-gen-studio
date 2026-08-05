"use client"

import { PauseIcon, PlayIcon, XIcon } from "lucide-react"
import type { DownloadJobView } from "@/lib/host"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes, formatEta } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  detailPct,
  formatPct,
  jobPct,
  statusLabel,
  stepStatusIcon,
} from "./download-progress"
import { TransferRail } from "./transfer-rail"

export type DownloadActiveJobProps = {
  active: DownloadJobView
  pendingCount: number
  speedBps: number
  activeDetail: string | null
  onPause: (jobId: string) => void
  onResume: (jobId: string) => void
  onCancel: (jobId: string) => void
}

export function DownloadActiveJob({
  active,
  pendingCount,
  speedBps,
  activeDetail,
  onPause,
  onResume,
  onCancel,
}: DownloadActiveJobProps) {
  const activeStep = active.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  const isTransfer = activeStep?.stepKind === "http"
  const pct = isTransfer ? jobPct(active) : detailPct(activeDetail)
  const bytesDone = isTransfer
    ? active.total != null
      ? active.downloaded
      : (activeStep?.bytesDone ?? 0)
    : 0
  const bytesTotal = isTransfer
    ? (active.total ?? activeStep?.bytesTotal ?? null)
    : null
  const remain =
    bytesTotal != null && bytesTotal > bytesDone ? bytesTotal - bytesDone : 0
  const showEta =
    active.status === "running" &&
    isTransfer &&
    speedBps > 8 * 1024 &&
    remain > 0
  const etaLabel = showEta
    ? ` · ${formatBytes(speedBps)}/s · ETA ${formatEta(remain / speedBps)}`
    : ""
  const workLabel =
    activeDetail?.trim() ||
    (activeStep ? `${activeStep.label}…` : null) ||
    "Working…"

  return (
    <li className="overflow-hidden rounded-2xl border border-primary/30 bg-card/80">
      <div className="space-y-4 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-mono text-sm font-medium">
              {active.status === "paused" ? (
                <PauseIcon className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Spinner className="size-3.5 shrink-0 text-primary" />
              )}
              {active.title}
              {pendingCount > 1 ? ` · ${pendingCount} jobs in queue` : null}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {active.status === "paused" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full before:hidden"
                onClick={() => onResume(active.id)}
              >
                <PlayIcon />
                Resume
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full before:hidden"
                onClick={() => onPause(active.id)}
              >
                <PauseIcon />
                Pause
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full before:hidden"
              onClick={() => onCancel(active.id)}
            >
              <XIcon />
              Cancel
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <TransferRail value={pct ?? 0} />
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>
              {isTransfer && bytesTotal != null
                ? `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)}${etaLabel}`
                : isTransfer && bytesDone > 0
                  ? `${formatBytes(bytesDone)}${etaLabel}`
                  : isTransfer
                    ? "Preparing…"
                    : pct != null
                      ? activeDetail
                          ?.replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "")
                          .trim() ||
                        (activeStep ? `${activeStep.label}…` : "Working…")
                      : workLabel}
            </span>
            <span className="text-foreground/85">
              {pct != null ? formatPct(pct) : "-"}
            </span>
          </div>
        </div>

        {active.steps.length > 1 ? (
          <ul className="space-y-1.5 border-t border-border/50 pt-3">
            {active.steps.map((step) => {
              const isActive =
                step.status === "running" || step.status === "paused"
              const stepPct =
                step.bytesTotal &&
                step.bytesTotal > 0 &&
                (isActive || step.status === "done" || step.bytesDone > 0)
                  ? Math.min(100, (step.bytesDone / step.bytesTotal) * 100)
                  : null
              const livePct =
                isActive && step.stepKind !== "http"
                  ? detailPct(activeDetail)
                  : null
              const rightPct = stepPct ?? livePct
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex items-center justify-between gap-3 font-mono text-[11px]",
                    isActive
                      ? "text-foreground"
                      : step.status === "done"
                        ? "text-muted-foreground"
                        : "text-muted-foreground/70"
                  )}
                >
                  <span className="min-w-0 truncate">
                    <span className="mr-2 inline-block w-3 text-center">
                      {stepStatusIcon(step.status)}
                    </span>
                    {step.label}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {step.bytesTotal != null && step.bytesTotal > 0
                      ? isActive || step.bytesDone > 0
                        ? `${formatBytes(step.bytesDone)} / ${formatBytes(step.bytesTotal)}`
                        : formatBytes(step.bytesTotal)
                      : null}
                    {step.bytesTotal != null && step.bytesTotal > 0
                      ? " · "
                      : null}
                    {rightPct != null
                      ? formatPct(rightPct)
                      : statusLabel(step.status)}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </li>
  )
}
