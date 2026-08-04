"use client"

import { TokenDialog } from "@/components/dialogs/token-dialog"

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
  return (
    <TokenDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title="Hugging Face token required"
      description={
        <>
          {blueprintName
            ? `${blueprintName} downloads gated models from Hugging Face.`
            : "This blueprint downloads gated models from Hugging Face."}{" "}
          Create an access token with read access, then paste it here to
          continue.
        </>
      }
      externalUrl={HF_TOKENS_URL}
      externalLabel="Create a token on Hugging Face"
      tokenLabel="Access token"
      tokenPlaceholder="hf_…"
      footerHint="Saved to Settings for future downloads. Need read access only."
    />
  )
}
