import { SparklesIcon, WandSparklesIcon } from "lucide-react"
import type { JobQueueItem } from "@/lib/host"

export function KindGlyph({ kind }: { kind: string }) {
  if (kind === "generate") {
    return <SparklesIcon className="size-3 text-muted-foreground" />
  }
  return <WandSparklesIcon className="size-3 text-muted-foreground" />
}

export function kindLabel(kind: string): string {
  if (kind === "generate") return "Generate"
  if (kind === "prompt-tool") return "Prompt Tools"
  return kind
}

export function statusLabel(
  item: JobQueueItem,
  stepLabel: string | null
): string {
  if (item.status === "running") {
    return stepLabel ?? "Running"
  }
  if (item.status === "paused") return "Paused"
  return "Waiting"
}

export function statusTone(status: string): string {
  if (status === "completed") return "text-emerald-400"
  if (status === "failed" || status === "cancelled") return "text-destructive"
  return "text-muted-foreground"
}
