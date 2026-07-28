import type { Dispatch, SetStateAction } from "react"
import type { StateCreator } from "zustand"
import {
  cancelDownload as hostCancelDownload,
  pauseDownload as hostPauseDownload,
  resumeDownload as hostResumeDownload,
  type DownloadSnapshot,
} from "@/lib/host"
import type { StudioStore } from "../studio-store-types"
import { applySet } from "./helpers"

export const EMPTY_DOWNLOAD_SNAPSHOT: DownloadSnapshot = {
  active: null,
  queued: [],
  history: [],
}

export type DownloadsSlice = {
  downloadSnapshot: DownloadSnapshot
  setDownloadSnapshot: Dispatch<SetStateAction<DownloadSnapshot>>
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

  setDownloadSnapshot: (next) =>
    set((s) => ({ downloadSnapshot: applySet(s.downloadSnapshot, next) })),

  pauseDownload: hostPauseDownload,
  resumeDownload: hostResumeDownload,
  cancelDownload: hostCancelDownload,
})
