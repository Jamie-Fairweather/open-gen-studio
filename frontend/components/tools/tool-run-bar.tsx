"use client"

import { Loader2Icon, SparklesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Run/cancel strip plus status/error for a tool job. */
export function ToolRunBar({
  label,
  busy,
  disabled,
  jobId,
  status,
  error,
  onRun,
  onCancel,
}: {
  label: string
  busy: boolean
  disabled: boolean
  jobId: string | null
  status: string | null
  error: string | null
  onRun: () => void
  onCancel: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          type="button"
          className="min-h-9 min-w-[9rem] gap-1.5"
          disabled={busy || disabled}
          onClick={onRun}
        >
          {busy ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SparklesIcon className="size-4" />
          )}
          {label}
        </Button>
        {busy && jobId ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-9"
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        {status ? (
          <p className="text-xs text-muted-foreground">{status}</p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </>
  )
}
