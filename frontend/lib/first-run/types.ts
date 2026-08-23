import type { GpuInfo, SystemSpecs } from "@/lib/host"
import type { OnboardingState, OnboardingStep } from "./helpers"

/** First-run overlay flags `planFirstRunInstall` reads to start Comfy / Blueprint. */
export type PlanFirstRunInstallInput = {
  step: OnboardingStep
  blueprintId: string | null
  hidden: boolean
  runtimeReady: boolean
  runtimeError: boolean
  runtimeJobPending: boolean
  runtimeInstalling: boolean
  runtimeStarted: boolean
  blueprintFound: boolean
  blueprintInstalled: boolean
  blueprintJobError: boolean
  blueprintJobQueued: boolean
  blueprintStarted: boolean
}

/** Next first-run install action (start, wait, reset a stale started flag). */
export type PlanFirstRunInstallResult =
  | { action: "done" }
  | { action: "wait" }
  | { action: "reset-runtime-started" }
  | { action: "reset-blueprint-started" }
  | { action: "mark-blueprint-queued" }
  | { action: "start-runtime" }
  | { action: "start-blueprint" }

/** Persisted onboarding + host facts used to pick the resume step. */
export type ResumeFirstRunInput = {
  persisted: OnboardingState | null
  gpu: GpuInfo | null
  savedVendor: string | null | undefined
  storageChosen: boolean
  specs: SystemSpecs | null
  hasHfToken: boolean
  catalog: readonly { id: string }[]
}

/** Step / Blueprint / skip flags after a cold start or settings reopen. */
export type ResumeFirstRunResult = {
  step: OnboardingStep
  blueprintId: string | null
  hfSkipped: boolean
  specsBypassed: boolean
}
