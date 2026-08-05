"use client"

import { DownloadIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { isPromptToolsJobKey } from "@/components/studio/slices/helpers"
import { useStudioStore } from "@/components/studio/store"
import { ToolSurface } from "@/components/tools/tool-shell"
import { Button } from "@/components/ui/button"
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import {
  cancelDownload,
  isTauri,
  listPromptToolWeights,
  pauseDownload,
  resumeDownload,
  type DownloadJobView,
  type PromptToolWeightInfo,
} from "@/lib/host"
import { MIN_ETA_SPEED_BPS } from "@/lib/download-thresholds"
import { formatBytes, formatEta } from "@/lib/format"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

export type ToolModelPhase =
  "checking" | "missing" | "installing" | "queued" | "ready" | "failed"

function jobPct(job: DownloadJobView): number | null {
  if (job.total != null && job.total > 0) {
    return Math.min(100, (job.downloaded / job.total) * 100)
  }
  const active = job.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  if (active?.bytesTotal && active.bytesTotal > 0) {
    return Math.min(100, (active.bytesDone / active.bytesTotal) * 100)
  }
  if (active && active.stepKind !== "http") return null
  return null
}

function findPromptToolsJob(
  active: DownloadJobView | null,
  queued: DownloadJobView[]
): { job: DownloadJobView; place: "active" | "queued" } | null {
  if (active && isPromptToolsJobKey(active.jobKey)) {
    return { job: active, place: "active" }
  }
  const q = queued.find((j) => isPromptToolsJobKey(j.jobKey))
  if (q) return { job: q, place: "queued" }
  return null
}

export function useToolModelGate(providerId: string) {
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)
  const downloadSpeedBps = useStudioStore((s) => s.downloadSpeedBps)
  const beginPromptToolsInstall = useStudioStore(
    (s) => s.beginPromptToolsInstall
  )
  const [weight, setWeight] = useState<PromptToolWeightInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [installError, setInstallError] = useState<string | null>(null)

  const refresh = async () => {
    if (!isTauri()) {
      setWeight(null)
      setChecking(false)
      return
    }
    try {
      const weights = await listPromptToolWeights()
      setWeight(
        weights.find((w) => w.provider === providerId) ?? weights[0] ?? null
      )
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    // Defer so setState in refresh() is not synchronous in the effect body.
    void Promise.resolve().then(() => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- provider-scoped mount refresh
  }, [providerId])

  const matched = findPromptToolsJob(
    downloadSnapshot.active,
    downloadSnapshot.queued
  )

  useEffect(() => {
    if (!matched && !checking) {
      void Promise.resolve().then(() => refresh())
    }
    // Re-check readiness when the shared prompt-tools job leaves the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched?.job.id, matched?.job.status, downloadSnapshot.history.length])

  const ready = Boolean(weight?.ready)
  const phase: ToolModelPhase = ready
    ? "ready"
    : matched?.place === "active"
      ? "installing"
      : matched?.place === "queued"
        ? "queued"
        : checking
          ? "checking"
          : installError
            ? "failed"
            : "missing"

  const install = async () => {
    setInstallError(null)
    try {
      await beginPromptToolsInstall(providerId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setInstallError(msg)
      notifyError(msg, "Install failed")
    }
  }

  return {
    phase,
    ready,
    weight,
    job: matched?.job ?? null,
    place: matched?.place ?? null,
    speedBps: downloadSpeedBps,
    installError,
    install,
    refresh,
  }
}

type ToolModelGateProps = {
  providerId: string
  toolLabel: string
  children: ReactNode
}

/** Hard gate: tool UI only renders when the provider model is ready. */
export function ToolModelGate({
  providerId,
  toolLabel,
  children,
}: ToolModelGateProps) {
  const gate = useToolModelGate(providerId)

  if (gate.ready) return children

  return (
    <ToolModelGatePanel
      toolLabel={toolLabel}
      phase={gate.phase}
      weight={gate.weight}
      job={gate.job}
      speedBps={gate.speedBps}
      installError={gate.installError}
      onInstall={() => void gate.install()}
    />
  )
}

function ToolModelGatePanel({
  toolLabel,
  phase,
  weight,
  job,
  speedBps,
  installError,
  onInstall,
}: {
  toolLabel: string
  phase: ToolModelPhase
  weight: PromptToolWeightInfo | null
  job: DownloadJobView | null
  speedBps: number
  installError: string | null
  onInstall: () => void
}) {
  const modelName = weight?.name ?? "Prompt Tools model"
  const description =
    weight?.description ?? `Required before you can use ${toolLabel}.`

  if (phase === "checking") {
    return (
      <ToolSurface>
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Checking model…
        </div>
      </ToolSurface>
    )
  }

  if (job && (phase === "installing" || phase === "queued")) {
    return (
      <ToolSurface>
        <div className="p-4 md:p-5">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {toolLabel}
          </p>
          <PromptToolsDownloadCard
            job={job}
            queued={phase === "queued"}
            speedBps={speedBps}
          />
        </div>
      </ToolSurface>
    )
  }

  return (
    <ToolSurface>
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {toolLabel}
          </p>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Install {modelName}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {description} This tool stays locked until the model is ready. The
            same transfer appears on Downloads.
          </p>
        </div>
        {!isTauri() ? (
          <p className="text-sm text-destructive" role="alert">
            Prompt Tools require the desktop app.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="min-h-9 gap-1.5"
              onClick={onInstall}
            >
              <DownloadIcon className="size-3.5" />
              Install
            </Button>
          </div>
        )}
        {installError || phase === "failed" ? (
          <p className="text-sm text-destructive" role="alert">
            {installError ?? "Install failed. Try again."}
          </p>
        ) : null}
      </div>
    </ToolSurface>
  )
}

/** Same transfer language as Downloads panel — one job, second viewpoint. */
function PromptToolsDownloadCard({
  job,
  queued,
  speedBps,
}: {
  job: DownloadJobView
  queued: boolean
  speedBps: number
}) {
  const pct = jobPct(job)
  const activeStep = job.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  const bytesDone =
    job.total != null ? job.downloaded : (activeStep?.bytesDone ?? 0)
  const bytesTotal = job.total ?? activeStep?.bytesTotal ?? null
  const remain =
    bytesTotal != null && speedBps > 0 ? (bytesTotal - bytesDone) / speedBps : 0
  const etaLabel =
    job.status === "running" && speedBps > MIN_ETA_SPEED_BPS && remain > 0
      ? ` · ${formatEta(remain)}`
      : ""

  if (queued) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/40">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <p className="truncate font-mono text-sm font-medium">{job.title}</p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground uppercase">
            Queued
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card/80">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-mono text-sm font-medium">
              {job.status === "paused" ? (
                <PauseIcon className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Spinner className="size-3.5 shrink-0 text-primary" />
              )}
              {job.title}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {job.status === "paused" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full before:hidden"
                onClick={() => void resumeDownload(job.id)}
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
                onClick={() => void pauseDownload(job.id)}
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
              onClick={() => void cancelDownload(job.id)}
            >
              <XIcon />
              Cancel
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Progress value={pct ?? 0} className="gap-0">
              <ProgressTrack
                className={cn(
                  "h-3 rounded-full bg-white/[0.06]",
                  pct == null && "border border-white/[0.06]"
                )}
              >
                <ProgressIndicator
                  className={cn(
                    "rounded-full",
                    pct == null ? "opacity-0" : "duration-300"
                  )}
                />
              </ProgressTrack>
            </Progress>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            <span>
              {bytesTotal != null
                ? `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)}${etaLabel}`
                : bytesDone > 0
                  ? `${formatBytes(bytesDone)}${etaLabel}`
                  : activeStep?.stepKind === "http"
                    ? "Preparing…"
                    : "Working…"}
            </span>
            <span className="text-foreground/85">
              {pct != null ? `${Math.min(100, pct).toFixed(2)}%` : "-"}
            </span>
          </div>
        </div>

        {job.steps.length > 1 ? (
          <ul className="space-y-1.5 border-t border-border/50 pt-3">
            {job.steps.map((step) => {
              const isActive =
                step.status === "running" || step.status === "paused"
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
                  <span className="min-w-0 truncate">{step.label}</span>
                  <span className="shrink-0 tabular-nums">
                    {step.status === "done"
                      ? "Ready"
                      : step.status === "error"
                        ? "Failed"
                        : isActive
                          ? "Running"
                          : "Waiting"}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
