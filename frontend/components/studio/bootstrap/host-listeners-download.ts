import { onDownloadManager, onDownloadProgress } from "@/lib/host"
import { MIN_ETA_SPEED_BPS } from "@/lib/download-thresholds"
import { formatBytes, formatEta } from "@/lib/format"
import {
  createDownloadSpeedTracker,
  type DownloadProgressPayload,
} from "@/components/studio/bootstrap/download-speed"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export function registerDownloadListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  const speedTracker = createDownloadSpeedTracker((bps) => {
    getStore().setDownloadSpeedBps(bps)
  })

  void onDownloadManager((snap) => {
    getStore().setDownloadSnapshot(snap)
    const runtimePending =
      snap.active?.kind === "runtime" ||
      snap.queued.some((j) => j.kind === "runtime")
    if (!runtimePending) {
      const failedRuntime = [...snap.history]
        .reverse()
        .find((j) => j.kind === "runtime" && j.status === "error")
      if (failedRuntime) {
        // Closing mid-extract can miss runtimes://progress; clear busy from the job.
        getStore().setRuntimeBusy(false)
        if (failedRuntime.error) {
          getStore().setRuntimeMessage(failedRuntime.error)
        }
      }
    }
    // Retry warm-start after runtime install: "done" can race the snapshot clear.
    getStore().maybeAutoStartComfy()
  }).then((u) => {
    handles.unlistenDownloadManager = u
  })

  void onDownloadProgress((p: DownloadProgressPayload) => {
    speedTracker.update(p)

    const total = p.total ? ` / ${formatBytes(p.total)}` : ""
    const pct =
      p.total && p.total > 0
        ? ` (${Math.min(100, Math.round((p.downloaded / p.total) * 100))}%)`
        : ""
    const emaSpeed = speedTracker.getEmaSpeed()
    let etaSuffix = ""
    if (
      !p.done &&
      p.total != null &&
      p.total > p.downloaded &&
      emaSpeed > MIN_ETA_SPEED_BPS
    ) {
      const remain = p.total - p.downloaded
      etaSuffix = ` · ${formatBytes(emaSpeed)}/s · ETA ${formatEta(remain / emaSpeed)}`
    }
    const msg = p.done
      ? "Download complete"
      : `${formatBytes(p.downloaded)}${total}${pct}${etaSuffix}`
    getStore().setRuntimeMessage(p.done ? msg : `Downloading… ${msg}`)
  }).then((u) => {
    handles.unlistenDownload = u
  })
}
