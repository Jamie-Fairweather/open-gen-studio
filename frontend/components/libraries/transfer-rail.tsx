"use client"

import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { cn } from "@/lib/utils"

export function TransferRail({
  value,
  idle,
}: {
  value: number
  idle?: boolean
}) {
  return (
    <div className="relative">
      <Progress value={idle ? 0 : value} className="gap-0">
        <ProgressTrack
          className={cn(
            "h-3 rounded-full bg-white/[0.06]",
            idle && "border border-white/[0.06]"
          )}
        >
          <ProgressIndicator
            className={cn("rounded-full", idle ? "opacity-0" : "duration-300")}
          />
        </ProgressTrack>
      </Progress>
      {idle ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[12%] w-px bg-primary/35"
        />
      ) : null}
    </div>
  )
}
