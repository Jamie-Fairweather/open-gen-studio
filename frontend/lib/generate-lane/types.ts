import type {
  BlueprintDetail,
  JobQueueItem,
  LoraPack,
  LoraStackEntry,
  StudioTab,
} from "@/lib/host"

/** Studio state a Generate click needs before it can submit. */
export type PlanGenerateSubmitInput = {
  catalogReady: boolean
  blueprintId: string | null
  installed: boolean
  modelsReady?: number
  modelCount?: number
  prompt: string
}

/** Why Generate cannot submit yet, or the Blueprint id to send. */
export type PlanGenerateSubmitResult =
  | { action: "wait-catalog" }
  | { action: "pick-blueprint" }
  | { action: "install-first" }
  | { action: "need-prompt" }
  | { action: "submit"; blueprintId: string }

/** Whether a generate Job is already holding the GPU slot. */
export type PlanGenerateLaneInput = {
  generating: boolean
  runningJobId: string | null
}

/**
 * Start a new generate lane, or enqueue behind the running Job.
 * `followLive` is false when the user is already watching another generate.
 */
export type PlanGenerateLaneResult =
  | { action: "start-lane"; followLive: boolean }
  | { action: "enqueue"; runningJobId: string; followLive: boolean }

/** Queue snapshot used to drop a finished generate Job. */
export type FinishGenerateLaneInput = {
  jobId: string
  queue: readonly JobQueueItem[]
  activeJobId: string | null
}

/** Store patch after a generate Job leaves the GPU queue. */
export type FinishGenerateLaneResult = {
  queue: JobQueueItem[]
  generating: boolean
  activeJobId: string | null
  clearPreview: boolean
}

/** generating / activeJob derived from a `jobs://queue` snapshot. */
export type ApplyGenerateQueueResult =
  | { action: "running"; jobId: string }
  | { action: "queued" }
  | { action: "idle" }

/** Raw `jobs://progress` fields after Prompt Tools are filtered out. */
export type PlanGenerateProgressInput = {
  stage: string
  jobId: string
  step?: number | null
  max?: number | null
  previewPath?: string | null
  message?: string
}

/** Store / toast patch for one generate progress event. */
export type PlanGenerateProgressResult =
  | { action: "runtime-start"; message: string }
  | { action: "dismiss-runtime" }
  | { action: "step"; jobId: string; step: number; max: number }
  | { action: "preview"; path: string }
  | { action: "finish"; notify: null }
  | { action: "finish"; notify: "cancelled"; message: string }
  | { action: "finish"; notify: "error"; message: string }

/** `jobs://updated` fields the generate lane cares about. */
export type PlanGenerateJobUpdateInput = {
  id: string
  kind: string
  status: string
  error?: string | null
}

/**
 * Terminal generate updates finish the lane; other kinds only prune
 * themselves from the queue.
 */
export type PlanGenerateJobUpdateResult =
  | { action: "ignore" }
  | { action: "prune" }
  | { action: "finish"; notify: null }
  | { action: "finish"; notify: "failed"; message: string }
  | { action: "finish"; notify: "cancelled" }

/** Studio controls compiled into the host `generate_image` values map. */
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
