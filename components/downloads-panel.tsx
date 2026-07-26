"use client"

import { DownloadIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import type { DownloadJobView, DownloadSnapshot } from "@/lib/host"
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
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"

type DownloadsPanelProps = {
  snapshot: DownloadSnapshot
  onPause: (jobId: string) => void
  onResume: (jobId: string) => void
  onCancel: (jobId: string) => void
  onOpenBlueprints?: () => void
}

function statusLabel(status: string): string {
  if (status === "done") return "Ready"
  if (status === "error") return "Failed"
  if (status === "cancelled") return "Cancelled"
  if (status === "paused") return "Paused"
  if (status === "running") return "Running"
  return "Waiting"
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

function jobPct(job: DownloadJobView): number | null {
  if (job.total != null && job.total > 0) {
    return Math.min(100, Math.round((job.downloaded / job.total) * 100))
  }
  const active = job.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  if (active?.bytesTotal && active.bytesTotal > 0) {
    return Math.min(
      100,
      Math.round((active.bytesDone / active.bytesTotal) * 100)
    )
  }
  return null
}

export function DownloadsPanel({
  snapshot,
  onPause,
  onResume,
  onCancel,
  onOpenBlueprints,
}: DownloadsPanelProps) {
  const active = snapshot.active
  const queued = snapshot.queued
  const history = snapshot.history
  const empty = !active && queued.length === 0 && history.length === 0
  const pendingCount = (active ? 1 : 0) + queued.length
  const statusLine = active
    ? queued.length > 0
      ? `${active.status === "paused" ? "Paused" : "Transferring"} · ${queued.length} waiting`
      : active.status === "paused"
        ? "Paused"
        : "Transferring"
    : queued.length > 0
      ? `${queued.length} waiting`
      : history.length > 0
        ? `${history.length} recent`
        : "Idle"

  const pct = active ? jobPct(active) : null
  const activeStep = active?.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  const bytesDone = activeStep?.bytesDone ?? active?.downloaded ?? 0
  const bytesTotal = activeStep?.bytesTotal ?? active?.total ?? null

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
                Installs persist across restarts. Pause anytime — partial files
                resume where they left off.
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
            {active ? (
              <li className="overflow-hidden rounded-2xl border border-primary/30 bg-card/80">
                <div className="space-y-4 p-4 md:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">
                        {active.activeLabel ?? active.title}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {active.status === "paused" ? (
                          <PauseIcon className="size-3.5 text-primary" />
                        ) : (
                          <Spinner className="size-3.5 text-primary" />
                        )}
                        {active.title}
                        {pendingCount > 1
                          ? ` · ${pendingCount} jobs in queue`
                          : null}
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
                        {bytesTotal != null
                          ? `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)}`
                          : bytesDone > 0
                            ? formatBytes(bytesDone)
                            : "Preparing…"}
                      </span>
                      <span className="text-foreground/85">
                        {pct != null ? `${pct}%` : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ) : null}

            {queued.length > 0 ? (
              <li className="pt-2">
                <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  Queue
                </p>
                <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
                  {queued.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">
                          {job.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {job.steps.length} step
                          {job.steps.length === 1 ? "" : "s"}
                          {job.status === "paused" ? " · paused" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {job.status === "paused" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full before:hidden"
                            onClick={() => onResume(job.id)}
                          >
                            <PlayIcon />
                            Resume
                          </Button>
                        ) : null}
                        <WithTooltip label="Remove from queue">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-full before:hidden"
                            onClick={() => onCancel(job.id)}
                          >
                            <XIcon />
                            Remove
                          </Button>
                        </WithTooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}

            {history.length > 0 ? (
              <li className="pt-2">
                <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                  Recent
                </p>
                <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
                  {history.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {job.title}
                        </p>
                        <WithTooltip label={job.error ?? job.status}>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {job.error ?? statusLabel(job.status)}
                          </p>
                        </WithTooltip>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          job.status === "done" && "text-primary",
                          job.status === "error" && "text-destructive",
                          (job.status === "cancelled" ||
                            job.status === "paused") &&
                            "text-muted-foreground"
                        )}
                      >
                        {statusLabel(job.status)}
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
