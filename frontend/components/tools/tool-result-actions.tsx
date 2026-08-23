"use client"

import { CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { notifySuccess } from "@/lib/notify"

/** Copy and Use-in-Studio actions for tool output. */
export function ToolResultActions({
  copyText,
  copyDisabled,
  useInStudioDisabled,
  onUseInStudio,
}: {
  copyText: string
  copyDisabled: boolean
  useInStudioDisabled: boolean
  onUseInStudio: () => void
}) {
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="min-h-9 gap-1.5"
        disabled={copyDisabled}
        onClick={() => {
          void navigator.clipboard.writeText(copyText)
          notifySuccess("Copied")
        }}
      >
        <CopyIcon className="size-3.5" />
        Copy
      </Button>
      <Button
        type="button"
        size="sm"
        className="min-h-9"
        disabled={useInStudioDisabled}
        onClick={onUseInStudio}
      >
        Use in Studio
      </Button>
    </>
  )
}
