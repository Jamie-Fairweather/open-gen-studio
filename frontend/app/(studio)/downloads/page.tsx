"use client"

import { useState } from "react"
import { TriangleAlertIcon } from "lucide-react"
import { DownloadsPanel } from "@/components/downloads-panel"
import { useStudioStore } from "@/components/studio/store"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { notifyError } from "@/lib/notify"

const KEYS_WARNING_DISMISS = "downloads_provider_keys_warning_dismissed"

function readKeysWarningDismissed() {
  try {
    return localStorage.getItem(KEYS_WARNING_DISMISS) === "1"
  } catch {
    return false
  }
}

export default function DownloadsStudioPage() {
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)
  const downloadSpeedBps = useStudioStore((s) => s.downloadSpeedBps)
  const runtimeMessage = useStudioStore((s) => s.runtimeMessage)
  const hfToken = useStudioStore((s) => s.hfToken)
  const civitaiToken = useStudioStore((s) => s.civitaiToken)
  const pauseDownload = useStudioStore((s) => s.pauseDownload)
  const resumeDownload = useStudioStore((s) => s.resumeDownload)
  const cancelDownload = useStudioStore((s) => s.cancelDownload)
  const setPickerOpen = useStudioStore((s) => s.setPickerOpen)
  const navigateTab = useStudioStore((s) => s.navigateTab)
  const [keysWarningDismissed, setKeysWarningDismissed] = useState(
    readKeysWarningDismissed
  )

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

  const missingHf = !hfToken.trim()
  const missingCivitai = !civitaiToken.trim()
  const showKeyWarning = (missingHf || missingCivitai) && !keysWarningDismissed

  const dismissKeysWarning = () => {
    try {
      localStorage.setItem(KEYS_WARNING_DISMISS, "1")
    } catch {
      // ignore
    }
    setKeysWarningDismissed(true)
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      <DownloadsPanel
        snapshot={downloadSnapshot}
        speedBps={downloadSpeedBps}
        activeDetail={activeDetail}
        banner={
          showKeyWarning ? (
            <Alert variant="warning" className="mb-4 shrink-0">
              <TriangleAlertIcon />
              <AlertTitle>Add API keys for faster downloads</AlertTitle>
              <AlertDescription>
                Hugging Face and CivitAI throttle anonymous transfers. Add your
                tokens in Settings to unlock full speed.
              </AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={dismissKeysWarning}
                >
                  Don&apos;t tell me again
                </Button>
                <Button
                  type="button"
                  size="xs"
                  onClick={() => navigateTab("settings")}
                >
                  Open Settings
                </Button>
              </AlertAction>
            </Alert>
          ) : null
        }
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
