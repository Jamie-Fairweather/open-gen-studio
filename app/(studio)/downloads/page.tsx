"use client"

import { DownloadsPanel } from "@/components/downloads-panel"
import { useStudio } from "@/components/studio/studio-provider"
import { notifyError } from "@/lib/notify"

export default function DownloadsStudioPage() {
  const s = useStudio()

  return (
    <div className="absolute inset-0 flex flex-col pt-14">
      <DownloadsPanel
        snapshot={s.downloadSnapshot}
        onPause={(jobId) => {
          void s
            .pauseDownload(jobId)
            .catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not pause"
              )
            )
        }}
        onResume={(jobId) => {
          void s
            .resumeDownload(jobId)
            .catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not resume"
              )
            )
        }}
        onCancel={(jobId) => {
          void s
            .cancelDownload(jobId)
            .catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not cancel"
              )
            )
        }}
        onOpenBlueprints={() => s.setPickerOpen(true)}
      />
    </div>
  )
}
