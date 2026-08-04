"use client"

import { ExternalLinkIcon, ShieldAlertIcon } from "lucide-react"
import { useState } from "react"
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
import { openExternalUrl } from "@/lib/host"
import type { GatedModelRepo } from "@/lib/hf"
import { notifyError } from "@/lib/notify"

type GatedModelDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Blueprint name for context, if known. */
  blueprintName?: string | null
  repos: GatedModelRepo[]
  onConfirm: () => Promise<void>
}

export function GatedModelDialog({
  open,
  onOpenChange,
  blueprintName,
  repos,
  onConfirm,
}: GatedModelDialogProps) {
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  function openUrl(url: string) {
    void openExternalUrl(url).catch((e) =>
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not open browser"
      )
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlertIcon className="size-5 text-amber-500" />
            Accept model terms
          </DialogTitle>
          <DialogDescription>
            {blueprintName
              ? `${blueprintName} uses gated Hugging Face models.`
              : "This blueprint uses gated Hugging Face models."}{" "}
            Open each model page, accept the license while signed in, then come
            back here to continue downloading.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-2">
          {repos.length > 0 ? (
            repos.map((repo) => (
              <Button
                key={repo.id}
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-between font-mono text-xs"
                onClick={() => openUrl(repo.pageUrl)}
              >
                <span className="truncate">{repo.id}</span>
                <ExternalLinkIcon className="size-3.5 shrink-0 opacity-70" />
              </Button>
            ))
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={() => openUrl("https://huggingface.co")}
            >
              Open Hugging Face
              <ExternalLinkIcon className="size-3.5 opacity-70" />
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">
            Use the same Hugging Face account that owns the access token saved
            in Settings.
          </p>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Continuing…" : "I've accepted - continue"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
