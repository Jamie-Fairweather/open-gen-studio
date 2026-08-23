"use client"

import { useEffect, useState } from "react"
import { blueprintIdFromJobKey } from "@/components/studio/slices/job-keys"
import { Button } from "@/components/ui/button"
import {
  detailPct,
  formatPct,
  friendlyInstallStatus,
  jobPct,
  statusLabel,
  stepStatusIcon,
} from "@/components/libraries/download-progress"
import { TransferRail } from "@/components/libraries/transfer-rail"
import { OnboardingErrorAlert } from "@/components/shell/onboarding-error-alert"
import { MIN_ETA_SPEED_BPS } from "@/lib/download-thresholds"
import { formatBytes, formatEta } from "@/lib/format"
import { getBlueprint } from "@/lib/host/blueprints"
import type {
  BlueprintDetail,
  DownloadJobView,
  DownloadSnapshot,
  DownloadStepView,
} from "@/lib/host"
import { cn } from "@/lib/utils"

const COMFY_FALLBACK_LABELS = [
  "Download ComfyUI",
  "Extract",
  "Configure",
  "Install Python packages",
  "Install extensions",
] as const

function pickJob(
  snapshot: DownloadSnapshot,
  match: (job: DownloadJobView) => boolean
): DownloadJobView | null {
  if (snapshot.active && match(snapshot.active)) return snapshot.active
  const queued = snapshot.queued.find(match)
  if (queued) return queued
  for (let i = snapshot.history.length - 1; i >= 0; i--) {
    const job = snapshot.history[i]
    if (job && match(job)) return job
  }
  return null
}

function fallbackComfySteps(status: "done" | "queued"): DownloadStepView[] {
  return COMFY_FALLBACK_LABELS.map((label, idx) => ({
    id: `comfy-fallback-${idx}`,
    idx,
    stepKind: idx === 0 ? "http" : "action",
    label,
    status,
    bytesDone: 0,
    bytesTotal: null,
    error: null,
  }))
}

function comfySteps(
  job: DownloadJobView | null,
  comfyReady: boolean
): DownloadStepView[] {
  if (job?.steps.length) return job.steps
  return fallbackComfySteps(comfyReady ? "done" : "queued")
}

/** Placeholder steps from blueprint detail until the download job is enqueued. */
export function previewBlueprintSteps(
  detail: Pick<BlueprintDetail, "id" | "name" | "models" | "modelCount">
): DownloadStepView[] {
  const models = (detail.models ?? []).filter(
    (m) => m.url != null && m.url.trim() !== "" && m.filename.trim() !== ""
  )
  if (models.length > 0) {
    return models.map((m, idx) => ({
      id: `blueprint-preview-${m.filename}`,
      idx,
      stepKind: "http",
      label: m.filename,
      status: "queued",
      bytesDone: 0,
      bytesTotal: null,
      error: null,
    }))
  }
  if (detail.modelCount > 0) {
    return Array.from({ length: detail.modelCount }, (_, idx) => ({
      id: `blueprint-preview-model-${idx}`,
      idx,
      stepKind: "http",
      label: `Download model ${idx + 1}`,
      status: "queued",
      bytesDone: 0,
      bytesTotal: null,
      error: null,
    }))
  }
  return [
    {
      id: `blueprint-preview-${detail.id}`,
      idx: 0,
      stepKind: "action",
      label: `Install ${detail.name}`,
      status: "queued",
      bytesDone: 0,
      bytesTotal: null,
      error: null,
    },
  ]
}

/** First-run install rail props: download snapshot, blueprint, and retry ownership. */
export type OnboardingInstallProgressProps = {
  snapshot: DownloadSnapshot
  blueprintId: string | null
  comfyReady: boolean
  speedBps: number
  runtimeMessage: string | null
  error: string | null
  onRetry: () => void
  /** When true, Retry is owned by the parent footer. */
  hideRetry?: boolean
}

/** First-run install rail: merges runtime + blueprint jobs, using preview steps until the blueprint job exists. */
export function OnboardingInstallProgress({
  snapshot,
  blueprintId,
  comfyReady,
  speedBps,
  runtimeMessage,
  error,
  onRetry,
  hideRetry = false,
}: OnboardingInstallProgressProps) {
  const runtimeJob = pickJob(snapshot, (j) => j.kind === "runtime")
  const blueprintJob = blueprintId
    ? pickJob(
        snapshot,
        (j) =>
          j.kind === "blueprint" &&
          blueprintIdFromJobKey(j.jobKey) === blueprintId
      )
    : null

  const needsPreview = Boolean(blueprintId && !blueprintJob?.steps.length)
  const [blueprintPreview, setBlueprintPreview] = useState<{
    id: string
    steps: DownloadStepView[]
  } | null>(null)

  useEffect(() => {
    if (!needsPreview || !blueprintId) return
    let cancelled = false
    void getBlueprint(blueprintId)
      .then((detail) => {
        if (!cancelled) {
          setBlueprintPreview({
            id: blueprintId,
            steps: previewBlueprintSteps(detail),
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlueprintPreview({
            id: blueprintId,
            steps: previewBlueprintSteps({
              id: blueprintId,
              name: blueprintId,
              models: [],
              modelCount: 0,
            }),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [needsPreview, blueprintId])

  const runtimeSteps = comfySteps(runtimeJob, comfyReady)
  const blueprintSteps = blueprintJob?.steps.length
    ? blueprintJob.steps
    : needsPreview && blueprintPreview?.id === blueprintId
      ? blueprintPreview.steps
      : []
  const combined = [
    ...runtimeSteps.map((s) => ({ step: s, key: `runtime:${s.id}` })),
    ...blueprintSteps.map((s) => ({ step: s, key: `blueprint:${s.id}` })),
  ]

  const activeJob =
    snapshot.active &&
    (snapshot.active.kind === "runtime" ||
      (snapshot.active.kind === "blueprint" &&
        blueprintIdFromJobKey(snapshot.active.jobKey) === blueprintId))
      ? snapshot.active
      : !comfyReady
        ? runtimeJob
        : blueprintJob

  const activeStep = activeJob?.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  // Live backend line — used for % sub-progress (extract), not as the title.
  // Sub-tasks (e.g. node install chatter) can race ahead of the active step.
  const activeDetail =
    activeJob?.kind === "runtime" &&
    activeStep &&
    activeStep.stepKind !== "http"
      ? friendlyInstallStatus(runtimeMessage)
      : null
  const detailProgress = detailPct(activeDetail)
  const isTransfer = activeStep?.stepKind === "http"
  const pct = activeJob
    ? isTransfer
      ? jobPct(activeJob)
      : detailProgress
    : null
  const bytesDone = isTransfer
    ? activeJob?.total != null
      ? activeJob.downloaded
      : (activeStep?.bytesDone ?? 0)
    : 0
  const bytesTotal = isTransfer
    ? (activeJob?.total ?? activeStep?.bytesTotal ?? null)
    : null
  const remain =
    bytesTotal != null && bytesTotal > bytesDone ? bytesTotal - bytesDone : 0
  const showEta =
    activeJob?.status === "running" &&
    isTransfer &&
    speedBps > MIN_ETA_SPEED_BPS &&
    remain > 0
  const etaLabel = showEta
    ? ` · ${formatBytes(speedBps)}/s · ETA ${formatEta(remain / speedBps)}`
    : ""
  // Keep the title on the active step label so it matches the list. Only show
  // the live message when it carries % progress for that same step.
  const stepLabel = activeStep ? `${activeStep.label}…` : null
  const workLabel =
    (detailProgress != null
      ? activeDetail?.replace(/\s*\d+(?:\.\d+)?\s*%\s*$/, "").trim()
      : null) ||
    stepLabel ||
    (comfyReady ? "Starting blueprint install…" : "Starting ComfyUI install…")

  return (
    <div className="w-full max-w-md space-y-4 text-left">
      <div className="space-y-2">
        <TransferRail value={pct ?? 0} idle={pct == null && !error} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span>
            {isTransfer && bytesTotal != null
              ? `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)}${etaLabel}`
              : isTransfer && bytesDone > 0
                ? `${formatBytes(bytesDone)}${etaLabel}`
                : isTransfer
                  ? "Preparing…"
                  : workLabel}
          </span>
          <span className="text-foreground/85">
            {error ? "Failed" : pct != null ? formatPct(pct) : "-"}
          </span>
        </div>
      </div>

      {error ? (
        <OnboardingErrorAlert title="Install failed" description={error} />
      ) : null}

      {combined.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border/50 pt-3">
          {combined.map(({ step, key }, index) => {
            const isActive =
              step.status === "running" || step.status === "paused"
            const stepPct =
              step.bytesTotal &&
              step.bytesTotal > 0 &&
              (isActive || step.status === "done" || step.bytesDone > 0)
                ? Math.min(100, (step.bytesDone / step.bytesTotal) * 100)
                : null
            const livePct =
              isActive &&
              step.stepKind !== "http" &&
              activeJob?.steps.some((s) => s.id === step.id)
                ? detailPct(activeDetail)
                : null
            const rightPct = stepPct ?? livePct
            return (
              <li
                key={key}
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
                  <span className="text-muted-foreground/80">{index + 1}.</span>{" "}
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

      {error && !hideRetry ? (
        <div className="flex justify-center pt-1">
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  )
}
