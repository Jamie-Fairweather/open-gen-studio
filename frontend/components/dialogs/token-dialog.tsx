"use client"

import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
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
import { Input } from "@/components/ui/input"
import { openExternalUrl } from "@/lib/host"
import { notifyError } from "@/lib/notify"

/** Copy, external-link, and save handler for a provider token prompt. */
export type TokenDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (token: string) => Promise<void>
  title: string
  description: ReactNode
  externalUrl: string
  externalLabel: string
  tokenLabel: string
  tokenPlaceholder: string
  footerHint: ReactNode
}

/** Shared token prompt: open provider settings, paste, save, then continue. */
export function TokenDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  externalUrl,
  externalLabel,
  tokenLabel,
  tokenPlaceholder,
  footerHint,
}: TokenDialogProps) {
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    const trimmed = token.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await onConfirm(trimmed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-5 text-amber-500" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => {
              void openExternalUrl(externalUrl).catch((e) =>
                notifyError(
                  e instanceof Error ? e.message : String(e),
                  "Could not open browser"
                )
              )
            }}
          >
            {externalLabel}
            <ExternalLinkIcon className="size-3.5 opacity-70" />
          </Button>
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">{tokenLabel}</span>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={tokenPlaceholder}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConfirm()
              }}
              className="font-mono text-xs"
              disabled={busy}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">{footerHint}</p>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy || !token.trim()}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Saving…" : "Save & download"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
