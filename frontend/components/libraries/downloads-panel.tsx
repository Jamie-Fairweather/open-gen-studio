"use client"

import type { ReactNode } from "react"
import type { DownloadSnapshot } from "@/lib/host"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/shell"
import { DownloadActiveJob } from "./download-active-job"
import { DownloadHistoryList } from "./download-history-list"
import { DownloadQueueList } from "./download-queue-list"
import { TransferRail } from "./transfer-rail"

type DownloadsPanelProps = {
  snapshot: DownloadSnapshot
  /** Smoothed bytes/sec for the active transfer (0 when unknown). */
  speedBps?: number
  /** Live status line for non-transfer steps (e.g. extract progress). */
  activeDetail?: string | null
  /** Optional notice above the queue (e.g. missing provider keys). */
  banner?: ReactNode
  onPause: (jobId: string) => void
  onResume: (jobId: string) => void
  onCancel: (jobId: string) => void
}

export function DownloadsPanel({
  snapshot,
  speedBps = 0,
  activeDetail = null,
  banner = null,
  onPause,
  onResume,
  onCancel,
}: DownloadsPanelProps) {
  const active = snapshot.active
  const queued = snapshot.queued
  const history = snapshot.history
  const empty = !active && queued.length === 0 && history.length === 0
  const pendingCount = (active ? 1 : 0) + queued.length

  const activeStep = active?.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  const isTransfer = activeStep?.stepKind === "http"
  const workLabel =
    activeDetail?.trim() ||
    (activeStep ? `${activeStep.label}…` : null) ||
    "Working…"
  const statusLine = active
    ? queued.length > 0
      ? `${isTransfer ? (active.status === "paused" ? "Paused" : "Transferring") : workLabel} · ${queued.length} waiting`
      : active.status === "paused"
        ? "Paused"
        : isTransfer
          ? "Transferring"
          : workLabel
    : queued.length > 0
      ? `${queued.length} waiting`
      : history.length > 0
        ? `${history.length} recent`
        : "Idle"

  return (
    <StudioPanel>
      <StudioPanelHeader title="Downloads" description={statusLine} />

      <StudioPanelBody>
        {banner}
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
                Installs persist across restarts. Pause anytime - partial files
                resume where they left off.
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3 pb-4">
            {active ? (
              <DownloadActiveJob
                active={active}
                pendingCount={pendingCount}
                speedBps={speedBps}
                activeDetail={activeDetail}
                onPause={onPause}
                onResume={onResume}
                onCancel={onCancel}
              />
            ) : null}
            <DownloadQueueList
              queued={queued}
              onResume={onResume}
              onCancel={onCancel}
            />
            <DownloadHistoryList history={history} />
          </ul>
        )}
      </StudioPanelBody>
    </StudioPanel>
  )
}
