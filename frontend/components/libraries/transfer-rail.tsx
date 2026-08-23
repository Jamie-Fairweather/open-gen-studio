"use client"

import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { cn } from "@/lib/utils"

/** Thick progress track; idle hides the indicator. */
export function TransferRail({
  value,
  idle,
}: {
  value: number
  idle?: boolean
}) {
  return (
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
  )
}
