"use client"

import { ExternalLinkIcon, KeyRoundIcon } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { openExternalUrl } from "@/lib/host"
import { notifyError } from "@/lib/notify"

const HF_TOKENS_URL =
  "https://huggingface.co/settings/tokens/new?preset=read-only"

type HfTokenDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Blueprint name for context, if known. */
  blueprintName?: string | null
  onConfirm: (token: string) => Promise<void>
}

export function HfTokenDialog({
  open,
  onOpenChange,
  blueprintName,
  onConfirm,
}: HfTokenDialogProps) {
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
            Hugging Face token required
          </DialogTitle>
          <DialogDescription>
            {blueprintName
              ? `${blueprintName} downloads gated models from Hugging Face.`
              : "This blueprint downloads gated models from Hugging Face."}{" "}
            Create an access token with read access, then paste it here to
            continue.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => {
              void openExternalUrl(HF_TOKENS_URL).catch((e) =>
                notifyError(
                  e instanceof Error ? e.message : String(e),
                  "Could not open browser"
                )
              )
            }}
          >
            Create a token on Hugging Face
            <ExternalLinkIcon className="size-3.5 opacity-70" />
          </Button>
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="text-muted-foreground">Access token</span>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="hf_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConfirm()
              }}
              className="font-mono text-xs"
              disabled={busy}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Saved to Settings for future downloads. Need read access only.
          </p>
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
