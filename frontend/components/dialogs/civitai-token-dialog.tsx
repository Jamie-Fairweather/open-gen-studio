"use client"

import { TokenDialog } from "@/components/dialogs/token-dialog"

/** Account page - user scrolls to API Keys (CivitAI has no deep link). */
const CIVITAI_ACCOUNT_URL = "https://civitai.com/user/account"

type CivitaiTokenDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Blueprint name for context, if known. */
  blueprintName?: string | null
  onConfirm: (token: string) => Promise<void>
}

/** Prompt for a CivitAI API key when a blueprint download needs one. */
export function CivitaiTokenDialog({
  open,
  onOpenChange,
  blueprintName,
  onConfirm,
}: CivitaiTokenDialogProps) {
  return (
    <TokenDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="CivitAI API key required"
      description={
        <>
          {blueprintName
            ? `${blueprintName} downloads models from CivitAI.`
            : "This blueprint downloads models from CivitAI."}{" "}
          Create an API key on your account page (scroll to{" "}
          <span className="font-medium text-foreground">API Keys</span>), then
          paste it here to continue.
        </>
      }
      externalUrl={CIVITAI_ACCOUNT_URL}
      externalLabel="Open CivitAI account settings"
      tokenLabel="API key"
      tokenPlaceholder="Paste API key…"
      footerHint="Saved to Settings for future downloads. CivitAI requires a key for all model downloads."
    />
  )
}
