"use client"

import { PlayIcon, XIcon } from "lucide-react"
import type { DownloadJobView } from "@/lib/host"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"

/** Waiting/paused download jobs; resume and remove without a progress rail. */
export function DownloadQueueList({
  queued,
  onResume,
  onCancel,
}: {
  queued: DownloadJobView[]
  onResume: (jobId: string) => void
  onCancel: (jobId: string) => void
}) {
  if (queued.length === 0) return null
  return (
    <li className="pt-2">
      <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Queue
      </p>
      <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
        {queued.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium">
                {job.title}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {job.steps.length} step
                {job.steps.length === 1 ? "" : "s"}
                {job.status === "paused" ? " · paused" : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {job.status === "paused" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full before:hidden"
                  onClick={() => onResume(job.id)}
                >
                  <PlayIcon />
                  Resume
                </Button>
              ) : null}
              <WithTooltip label="Remove from queue">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full before:hidden"
                  onClick={() => onCancel(job.id)}
                >
                  <XIcon />
                  Remove
                </Button>
              </WithTooltip>
            </div>
          </li>
        ))}
      </ul>
    </li>
  )
}
