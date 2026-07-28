"use client"

import { DownloadsPanel } from "@/components/downloads-panel"
import { useStudioStore } from "@/components/studio/store"
import { notifyError } from "@/lib/notify"

export default function DownloadsStudioPage() {
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)
  const downloadSpeedBps = useStudioStore((s) => s.downloadSpeedBps)
  const runtimeMessage = useStudioStore((s) => s.runtimeMessage)
  const pauseDownload = useStudioStore((s) => s.pauseDownload)
  const resumeDownload = useStudioStore((s) => s.resumeDownload)
  const cancelDownload = useStudioStore((s) => s.cancelDownload)
  const setPickerOpen = useStudioStore((s) => s.setPickerOpen)

  const active = downloadSnapshot.active
  const activeDetail =
    active?.kind === "runtime" &&
    active.steps.some(
      (s) =>
        (s.status === "running" || s.status === "paused") &&
        s.stepKind !== "http"
    )
      ? runtimeMessage
      : null

  return (
    <div className="absolute inset-0 flex flex-col pt-14">
      <DownloadsPanel
        snapshot={downloadSnapshot}
        speedBps={downloadSpeedBps}
        activeDetail={activeDetail}
        onPause={(jobId) => {
          void pauseDownload(jobId).catch((e) =>
            notifyError(
              e instanceof Error ? e.message : String(e),
              "Could not pause"
            )
          )
        }}
        onResume={(jobId) => {
          void resumeDownload(jobId).catch((e) =>
            notifyError(
              e instanceof Error ? e.message : String(e),
              "Could not resume"
            )
          )
        }}
        onCancel={(jobId) => {
          void cancelDownload(jobId).catch((e) =>
            notifyError(
              e instanceof Error ? e.message : String(e),
              "Could not cancel"
            )
          )
        }}
        onOpenBlueprints={() => setPickerOpen(true)}
      />
    </div>
  )
}
