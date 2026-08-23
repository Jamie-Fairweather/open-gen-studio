import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  cancelDownload as hostCancelDownload,
  pauseDownload as hostPauseDownload,
  resumeDownload as hostResumeDownload,
  type DownloadSnapshot,
} from "@/lib/host"
import { nextPendingUpscaleIds } from "@/lib/catalog-install"
import type { StudioStore } from "../studio-store-types"
import { applySet } from "./helpers"

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadSnapshot = {
  active: null,
  queued: [],
  history: [],
}

/** Download queue snapshot and transfer-speed state for the studio store. */
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

/** Zustand slice: download snapshot, speed, and pause/resume/cancel. */
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
      return {
        downloadSnapshot,
        pendingUpscaleIds: nextPendingUpscaleIds(
          s.pendingUpscaleIds,
          downloadSnapshot
        ),
      }
    }),

  setDownloadSpeedBps: (bps) => set({ downloadSpeedBps: bps }),

  pauseDownload: hostPauseDownload,
  resumeDownload: hostResumeDownload,
  cancelDownload: hostCancelDownload,
})
