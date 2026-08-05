"use client"

import type { DownloadJobView } from "@/lib/host"
import { WithTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { statusLabel } from "./download-progress"

export function DownloadHistoryList({
  history,
}: {
  history: DownloadJobView[]
}) {
  if (history.length === 0) return null
  return (
    <li className="pt-2">
      <p className="mb-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        Recent
      </p>
      <ul className="divide-y divide-border/50 rounded-2xl border border-border/60 bg-card/40">
        {history.map((job) => (
          <li
            key={job.id}
            className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{job.title}</p>
              <WithTooltip label={job.error ?? job.status}>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {job.error ?? statusLabel(job.status)}
                </p>
              </WithTooltip>
            </div>
            <span
              className={cn(
                "shrink-0 text-xs font-medium",
                job.status === "done" && "text-primary",
                job.status === "error" && "text-destructive",
                (job.status === "cancelled" || job.status === "paused") &&
                  "text-muted-foreground"
              )}
            >
              {statusLabel(job.status)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  )
}
