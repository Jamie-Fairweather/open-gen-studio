import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  cancelDownload as hostCancelDownload,
  pauseDownload as hostPauseDownload,
  resumeDownload as hostResumeDownload,
  type DownloadSnapshot,
} from "@/lib/host"
import type { StudioStore } from "../studio-store-types"
import { applySet, upscaleIdFromJobKey } from "./helpers"

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadSnapshot = {
  active: null,
  queued: [],
  history: [],
}

export type DownloadsSlice = {
  downloadSnapshot: DownloadSnapshot
  /** Smoothed transfer rate (bytes/sec) for the active download. */
  downloadSpeedBps: number
  setDownloadSnapshot: Dispatch<SetStateAction<DownloadSnapshot>>
  setDownloadSpeedBps: (bps: number) => void
  pauseDownload: (jobId: string) => Promise<void>
  resumeDownload: (jobId: string) => Promise<void>
  cancelDownload: (jobId: string) => Promise<void>
}

export const createDownloadsSlice: StateCreator<
  StudioStore,
  [],
  [],
  DownloadsSlice
> = (set) => ({
  downloadSnapshot: EMPTY_DOWNLOAD_SNAPSHOT,
  downloadSpeedBps: 0,

  setDownloadSnapshot: (next) =>
    set((s) => {
      const downloadSnapshot = applySet(s.downloadSnapshot, next)
      const live = new Set<string>()
      if (downloadSnapshot.active?.jobKey) {
        const id = upscaleIdFromJobKey(downloadSnapshot.active.jobKey)
        if (id) live.add(id)
      }
      for (const job of downloadSnapshot.queued) {
        const id = upscaleIdFromJobKey(job.jobKey)
        if (id) live.add(id)
      }
      return {
        downloadSnapshot,
        pendingUpscaleIds: s.pendingUpscaleIds.filter((id) => !live.has(id)),
      }
    }),

  setDownloadSpeedBps: (bps) => set({ downloadSpeedBps: bps }),

  pauseDownload: hostPauseDownload,
  resumeDownload: hostResumeDownload,
  cancelDownload: hostCancelDownload,
})
