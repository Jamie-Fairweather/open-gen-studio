import type {
  BlueprintDetail,
  JobQueueItem,
  LoraPack,
  LoraStackEntry,
  StudioTab,
} from "@/lib/host"

export type PlanGenerateSubmitInput = {
  catalogReady: boolean
  blueprintId: string | null
  installed: boolean
  modelsReady?: number
  modelCount?: number
  prompt: string
}

export type PlanGenerateSubmitResult =
  | { action: "wait-catalog" }
  | { action: "pick-blueprint" }
  | { action: "install-first" }
  | { action: "need-prompt" }
  | { action: "submit"; blueprintId: string }

export type PlanGenerateLaneInput = {
  generating: boolean
  runningJobId: string | null
}

export type PlanGenerateLaneResult =
  | { action: "start-lane"; followLive: boolean }
  | { action: "enqueue"; runningJobId: string; followLive: boolean }

export type FinishGenerateLaneInput = {
  jobId: string
  queue: readonly JobQueueItem[]
  activeJobId: string | null
}

export type FinishGenerateLaneResult = {
  queue: JobQueueItem[]
  generating: boolean
  activeJobId: string | null
  clearPreview: boolean
}

export type ApplyGenerateQueueResult =
  | { action: "running"; jobId: string }
  | { action: "queued" }
  | { action: "idle" }

export type PlanGenerateProgressInput = {
  stage: string
  jobId: string
  step?: number | null
  max?: number | null
  previewPath?: string | null
  message?: string
}

export type PlanGenerateProgressResult =
  | { action: "runtime-start"; message: string }
  | { action: "dismiss-runtime" }
  | { action: "step"; jobId: string; step: number; max: number }
  | { action: "preview"; path: string }
  | { action: "finish"; notify: null }
  | { action: "finish"; notify: "cancelled"; message: string }
  | { action: "finish"; notify: "error"; message: string }

export type PlanGenerateJobUpdateInput = {
  id: string
  kind: string
  status: string
  error?: string | null
}

export type PlanGenerateJobUpdateResult =
  | { action: "ignore" }
  | { action: "prune" }
  | { action: "finish"; notify: null }
  | { action: "finish"; notify: "failed"; message: string }
  | { action: "finish"; notify: "cancelled" }

export type BuildGenerateValuesInput = {
  prompt: string
  controlValues: Record<string, unknown>
  activeDetail: BlueprintDetail | null
  activeArch: string | null
  loraStack: LoraStackEntry[]
  loraPacks: LoraPack[]
  studioTab: StudioTab
  upscaleEnabled: boolean
  upscaleModelId: string
  usduEnabled: boolean
  usduScale: number
  usduSteps: number
  usduDenoise: number
}
