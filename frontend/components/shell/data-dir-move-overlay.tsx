"use client"

import { HardDriveIcon } from "lucide-react"
import { useEffect, useSyncExternalStore } from "react"
import { Titlebar } from "@/components/shell/titlebar"
import {
  getDataDirMoveActive,
  getDataDirMoveProgress,
  subscribeDataDirMove,
  updateDataDirMove,
} from "@/lib/data-dir-move"
import { isTauri, onDataDirCloseBlocked, onDataDirProgress } from "@/lib/host"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

export function DataDirMoveOverlay() {
  const active = useSyncExternalStore(
    subscribeDataDirMove,
    getDataDirMoveActive,
    () => false
  )
  const progress = useSyncExternalStore(
    subscribeDataDirMove,
    getDataDirMoveProgress,
    () => null
  )

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const unsubs: Array<() => void> = []
    void onDataDirProgress((p) => {
      if (cancelled) return
      updateDataDirMove(p)
    }).then((u) => {
      if (cancelled) u()
      else unsubs.push(u)
    })
    void onDataDirCloseBlocked((message) => {
      notifyError(message, "Can't close yet")
    }).then((u) => {
      if (cancelled) u()
      else unsubs.push(u)
    })
    return () => {
      cancelled = true
      for (const u of unsubs) u()
    }
  }, [])

  if (!active) return null

  const total = Math.max(1, progress?.total ?? 1)
  const current = Math.min(total, progress?.current ?? 0)
  const pct = Math.round((current / total) * 100)
  const message = progress?.message ?? "Moving library files…"

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-background"
      role="alertdialog"
      aria-modal="true"
      aria-label="Moving data folder"
      aria-busy="true"
    >
      <Titlebar
        leading={
          <div className="flex items-center gap-2 text-sm font-medium">
            <HardDriveIcon className="size-4 text-primary" aria-hidden />
            <span className="hidden sm:inline">Moving data folder</span>
          </div>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="w-full max-w-md space-y-3">
          <h1 className="text-center font-heading text-xl font-semibold tracking-tight">
            Moving your library
          </h1>
          <p className="text-center text-sm text-muted-foreground">
            Please wait — don&apos;t close the app until this finishes. Large
            model folders can take a few minutes.
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
                progress?.stage === "preparing" && "animate-pulse"
              )}
              style={{
                width:
                  progress?.stage === "preparing" && current === 0
                    ? "15%"
                    : `${pct}%`,
              }}
            />
          </div>
          <p className="text-center font-mono text-xs text-muted-foreground">
            {message}
            {progress && progress.total > 0 && progress.stage === "moving"
              ? ` (${current}/${total})`
              : ""}
          </p>
        </div>
      </div>
    </div>
  )
}
