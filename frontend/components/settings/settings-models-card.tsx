"use client"

import { FolderOpenIcon, HardDriveIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { beginDataDirMove, endDataDirMove } from "@/lib/data-dir-move"
import {
  getDataDirInfo,
  isTauri,
  openDataDir,
  pickDataDir,
  relaunchApp,
  setDataDir,
  type DataDirInfo,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

/** Models & data card: browse weights, open the library folder, and relocate the data dir. Move overlay stays until relaunch. */
export function SettingsModelsCard({
  onBrowseModels,
}: {
  onBrowseModels: () => void
}) {
  const [info, setInfo] = useState<DataDirInfo | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    void getDataDirInfo()
      .then((next) => {
        if (!cancelled) setInfo(next)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function changeLocation() {
    setBusy(true)
    let moving = false
    try {
      const picked = await pickDataDir()
      if (!picked) return
      beginDataDirMove("Pausing queue and preparing move…")
      moving = true
      const result = await setDataDir(picked)
      const next = await getDataDirInfo().catch(() => null)
      if (next) setInfo(next)
      if (result.needsRestart) {
        // Overlay stays up until relaunch exits this process.
        await relaunchApp()
        return
      }
      endDataDirMove()
      moving = false
      notifySuccess("Data folder updated", result.path)
    } catch (e) {
      if (moving) endDataDirMove()
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not change data folder"
      )
    } finally {
      setBusy(false)
    }
  }

  async function openFolder() {
    try {
      await openDataDir()
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not open data folder"
      )
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <p className="font-medium">Models & data</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Shared weights library, ComfyUI runtime, gallery, and app database.
      </p>
      {info ? (
        <p className="mt-2 font-mono text-[11px] break-all text-muted-foreground">
          {info.path}
          {info.isCustom ? " (custom)" : ""}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onBrowseModels}
        >
          <HardDriveIcon />
          Browse models
        </Button>
        {isTauri() ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void openFolder()}
            >
              <FolderOpenIcon />
              Open folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void changeLocation()}
            >
              {busy ? "Working…" : "Change location…"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
