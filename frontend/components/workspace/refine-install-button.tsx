"use client"

import { ClockIcon, DownloadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { WithTooltip } from "@/components/ui/tooltip"

export type RefineInstallButtonProps = {
  installing: boolean
  queued: boolean
  busy: boolean
  disabled?: boolean
  downloadLabel: string
  downloadAriaLabel: string
  queuedAriaLabel: string
  installingAriaLabel: string
  onInstall: () => void
}

/** Shared download / queued / installing icon button for refine installs. */
export function RefineInstallButton({
  installing,
  queued,
  busy,
  disabled,
  downloadLabel,
  downloadAriaLabel,
  queuedAriaLabel,
  installingAriaLabel,
  onInstall,
}: RefineInstallButtonProps) {
  if (installing) {
    return (
      <WithTooltip label="Downloading — see Downloads">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="size-8 shrink-0"
          disabled
          aria-label={installingAriaLabel}
        >
          <Spinner className="size-3.5" />
        </Button>
      </WithTooltip>
    )
  }
  if (queued) {
    return (
      <WithTooltip label="Queued in Downloads">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="size-8 shrink-0"
          disabled
          aria-label={queuedAriaLabel}
        >
          <ClockIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </WithTooltip>
    )
  }
  return (
    <WithTooltip label={downloadLabel}>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        className="size-8 shrink-0"
        disabled={disabled || busy}
        aria-label={downloadAriaLabel}
        onClick={onInstall}
      >
        <DownloadIcon className="size-3.5" />
      </Button>
    </WithTooltip>
  )
}
