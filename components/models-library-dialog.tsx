"use client"

import { FolderOpenIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { listModelFiles, openModelsDir, type ModelFileEntry } from "@/lib/host"
import { notifyError } from "@/lib/notify"

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

type ModelsLibraryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ModelsLibraryBody() {
  const [files, setFiles] = useState<ModelFileEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false
    void listModelFiles()
      .then((list) => {
        if (!cancelled) setFiles(list)
      })
      .catch((e) => {
        if (!cancelled) {
          notifyError(e instanceof Error ? e.message : String(e), "Models")
          setFiles([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const list = files ?? []
  const totalBytes = list.reduce((sum, f) => sum + f.bytes, 0)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Models library</DialogTitle>
        <DialogDescription>
          Shared weights used by all blueprints
          {files && files.length > 0
            ? ` · ${files.length} files · ${formatBytes(totalBytes)}`
            : null}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="max-h-[50vh] overflow-y-auto">
        {files == null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No model files yet. Install a blueprint to download weights here.
          </p>
        ) : (
          <ul className="space-y-1.5 font-mono text-[11px]">
            {list.map((f) => (
              <li
                key={f.relativePath}
                className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-0"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {f.relativePath}
                </span>
                <span className="shrink-0 text-foreground/80 tabular-nums">
                  {formatBytes(f.bytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Close
        </DialogClose>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void openModelsDir().catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not open folder"
              )
            )
          }}
        >
          <FolderOpenIcon />
          Open folder
        </Button>
      </DialogFooter>
    </>
  )
}

export function ModelsLibraryDialog({
  open,
  onOpenChange,
}: ModelsLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        {open ? <ModelsLibraryBody key="models-body" /> : null}
      </DialogPopup>
    </Dialog>
  )
}
