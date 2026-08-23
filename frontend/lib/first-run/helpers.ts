import { isInstalled } from "@/lib/blueprint-helpers"
import type {
  Blueprint,
  GpuInfo,
  RuntimeInstall,
  SystemSpecs,
} from "@/lib/host"

export const SETTING_ONBOARDING = "ui_onboarding_v1"

/** First-run wizard page; `resolveOnboardingStep` may skip GPU/Specs when they don't apply. */
export type OnboardingStep =
  "specs" | "storage" | "gpu" | "hf" | "blueprint" | "install"

/** Persisted first-run snapshot (`ui_onboarding_v1`); invalid/unknown `step` parses as null. */
export type OnboardingState = {
  step: OnboardingStep
  blueprintId: string | null
  hfSkipped: boolean
  /** User bypassed the under-spec hardware warning. */
  specsBypassed: boolean
}

/** Product floor for local generation (Surface / iGPU machines typically fail this). */
export const MIN_RAM_GB = 16
export const MIN_VRAM_GB = 8
/** Comfortable tier for recommended Official Blueprints. */
export const REC_RAM_GB = 32
export const REC_VRAM_GB = 16

/** Dev/test: `NEXT_PUBLIC_FORCE_ONBOARDING_SPECS=1` in `frontend/.env.local` (not used by desktop:build). */
export function forceOnboardingSpecs(): boolean {
  const v = process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS?.trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

export const ONBOARDING_RECOMMENDED: {
  id: string
  blurb: string
}[] = [
  {
    id: "krea2-turbo",
    blurb: "Best balance of quality and speed. 8GB VRAM.",
  },
  {
    id: "flux2-dev",
    blurb: "Highest quality. 16GB VRAM.",
  },
  {
    id: "z-image-turbo",
    blurb: "Faster on lower-end GPUs. 8GB VRAM.",
  },
]

const ONBOARDING_STEPS: OnboardingStep[] = [
  "specs",
  "storage",
  "gpu",
  "hf",
  "blueprint",
  "install",
]

/** Parse persisted onboarding JSON; invalid / unknown step → null. */
export function parseOnboardingState(
  raw: string | null | undefined
): OnboardingState | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    if (
      typeof parsed.step !== "string" ||
      !ONBOARDING_STEPS.includes(parsed.step as OnboardingStep)
    ) {
      return null
    }
    return {
      step: parsed.step as OnboardingStep,
      blueprintId:
        typeof parsed.blueprintId === "string" && parsed.blueprintId.trim()
          ? parsed.blueprintId
          : null,
      hfSkipped: Boolean(parsed.hfSkipped),
      specsBypassed: Boolean(parsed.specsBypassed),
    }
  } catch {
    return null
  }
}

/** Persist onboarding wizard state as a settings string. */
export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state)
}

/** ComfyUI runtime is install-complete and usable (ready / running / starting). */
export function isComfyReady(
  runtimes: RuntimeInstall[] | null | undefined
): boolean {
  const comfy = runtimes?.find((r) => r.engine === "comfyui")
  if (!comfy?.installPath?.trim()) return false
  return (
    comfy.status === "ready" ||
    comfy.status === "running" ||
    comfy.status === "starting"
  )
}

/** ComfyUI runtime row is mid-install (not ready yet). */
export function isComfyInstalling(
  runtimes: RuntimeInstall[] | null | undefined
): boolean {
  const comfy = runtimes?.find((r) => r.engine === "comfyui")
  return comfy?.status === "installing"
}

/** At least one Official Blueprint has all model files on disk. */
export function hasInstalledOfficialBlueprint(
  blueprints: Blueprint[] | null | undefined
): boolean {
  return (blueprints ?? []).some(
    (bp) => bp.source === "official" && isInstalled(bp)
  )
}

/** Studio stays gated until Runtime + at least one Official Blueprint are ready. */
export function needsOnboarding(
  runtimes: RuntimeInstall[] | null | undefined,
  blueprints: Blueprint[] | null | undefined
): boolean {
  if (forceOnboardingSpecs()) return true
  return !isComfyReady(runtimes) || !hasInstalledOfficialBlueprint(blueprints)
}

/** Product name for the studio gate. Same check as `needsOnboarding`. */
export const needsFirstRun = needsOnboarding

/** GPU vendor picker is required and nothing is saved yet. */
export function needsGpuStep(
  gpu: GpuInfo | null,
  savedVendor: string | null | undefined
): boolean {
  if (!gpu?.needsVendorChoice) return false
  return !savedVendor?.trim()
}

/** Bytes → GiB (1024³); null/non-finite/≤0 stay unknown. */
export function bytesToGb(bytes: number | null | undefined): number | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null
  return bytes / (1024 * 1024 * 1024)
}

/** Best VRAM from GpuInfo adapters (same strings the GPU step already shows). */
export function vramBytesFromGpu(
  gpu: GpuInfo | null | undefined
): number | null {
  if (!gpu) return null
  let maxBytes = 0
  for (const raw of [
    gpu.memoryTotal,
    ...gpu.adapters.map((a) => a.memoryTotal),
  ]) {
    const bytes = memoryTotalToBytes(raw)
    if (bytes != null && bytes > maxBytes) maxBytes = bytes
  }
  return maxBytes > 0 ? maxBytes : null
}

function memoryTotalToBytes(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null
  const match = raw.trim().match(/^([\d.]+)\s*(mi?b|gi?b|ti?b)?/i)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n <= 0) return null
  const unit = (match[2] ?? "mib").toLowerCase()
  if (unit.startsWith("t")) return n * 1024 ** 4
  if (unit.startsWith("g")) return n * 1024 ** 3
  return n * 1024 ** 2
}

/** Fill gaps when getSystemSpecs fails/partial — GPU step data is the source of truth for VRAM. */
export function mergeSystemSpecs(
  specs: SystemSpecs | null | undefined,
  gpu: GpuInfo | null | undefined
): SystemSpecs {
  const fromGpu = vramBytesFromGpu(gpu)
  return {
    ramBytes: specs?.ramBytes ?? null,
    vramBytes: fromGpu ?? specs?.vramBytes ?? null,
    gpuName:
      gpu?.name ??
      gpu?.adapters.find((a) => a.vendor === "nvidia")?.name ??
      gpu?.adapters[0]?.name ??
      specs?.gpuName ??
      null,
  }
}

/** True when RAM and VRAM both clear the product floor. Unknown VRAM fails closed. */
export function meetsMinimumSpecs(
  specs: SystemSpecs | null | undefined
): boolean {
  if (!specs) return false
  const ramGb = bytesToGb(specs.ramBytes)
  const vramGb = bytesToGb(specs.vramBytes)
  if (ramGb == null || vramGb == null) return false
  return ramGb >= MIN_RAM_GB && vramGb >= MIN_VRAM_GB
}

/** Show Hardware step unless the user already bypassed (or force-flag). */
export function needsSpecsStep(opts: {
  specs: SystemSpecs | null | undefined
  specsBypassed: boolean
}): boolean {
  if (opts.specsBypassed) return false
  if (forceOnboardingSpecs()) return true
  return !meetsMinimumSpecs(opts.specs)
}

/** After Storage: GPU picker if needed, otherwise Blueprint. */
export function stepAfterStorage(
  gpu: GpuInfo | null,
  savedVendor: string | null | undefined
): OnboardingStep {
  return needsGpuStep(gpu, savedVendor) ? "gpu" : "blueprint"
}

/**
 * First-run order: Specs (if under min) → Storage → GPU (if needed) → Blueprint → HF → Install.
 * Gated blueprints stay out of the picker; HF is optional after they've seen one.
 */
export function resolveOnboardingStep(opts: {
  persisted: OnboardingState | null
  gpu: GpuInfo | null
  savedVendor: string | null | undefined
  storageChosen: boolean
  specs: SystemSpecs | null
}): OnboardingStep {
  const { persisted, gpu, savedVendor, storageChosen, specs } = opts
  // Force flag: re-show Hardware on each cold start (session Continue still works).
  const specsBypassed = forceOnboardingSpecs()
    ? false
    : Boolean(persisted?.specsBypassed)
  if (needsSpecsStep({ specs, specsBypassed })) return "specs"
  if (!storageChosen) return "storage"
  if (persisted?.step === "specs" || persisted?.step === "storage") {
    return stepAfterStorage(gpu, savedVendor)
  }
  if (persisted?.step === "install" && persisted.blueprintId) {
    return "install"
  }
  if (persisted?.step === "hf") {
    if (needsGpuStep(gpu, savedVendor)) return "gpu"
    // Old flows could land on HF before a pick — send them to Blueprint first.
    if (!persisted.blueprintId) return "blueprint"
    return "hf"
  }
  if (persisted?.step === "blueprint") {
    if (needsGpuStep(gpu, savedVendor)) return "gpu"
    return "blueprint"
  }
  if (persisted?.step === "gpu") {
    return needsGpuStep(gpu, savedVendor) ? "gpu" : "blueprint"
  }
  return stepAfterStorage(gpu, savedVendor)
}

/** Official image blueprints for first-run — gated (HF) packs are always hidden. */
export function officialBlueprintsForOnboarding(
  blueprints: Blueprint[]
): Blueprint[] {
  return blueprints.filter((bp) => {
    if (bp.source !== "official") return false
    if (bp.category.toLowerCase() !== "image") return false
    if (bp.requiresHfToken) return false
    return true
  })
}

/** Split first-run packs into featured ids vs the rest (name-sorted). */
export function partitionRecommended(blueprints: Blueprint[]): {
  recommended: Blueprint[]
  rest: Blueprint[]
} {
  const byId = new Map(blueprints.map((bp) => [bp.id, bp]))
  const recommended: Blueprint[] = []
  for (const { id } of ONBOARDING_RECOMMENDED) {
    const bp = byId.get(id)
    if (bp) recommended.push(bp)
  }
  const recommendedIds = new Set(recommended.map((bp) => bp.id))
  const rest = blueprints
    .filter((bp) => !recommendedIds.has(bp.id))
    .toSorted((a, b) => a.name.localeCompare(b.name))
  return { recommended, rest }
}

/** Marketing blurb for a featured first-run Blueprint id. */
export function recommendedBlurb(id: string): string | null {
  return ONBOARDING_RECOMMENDED.find((r) => r.id === id)?.blurb ?? null
}

/** Display GB for Hardware copy; floors so 15.6GB cannot look like 16. */
export function formatSpecGb(gb: number | null | undefined): string {
  if (gb == null || !Number.isFinite(gb)) return "Unknown"
  // Floor to one decimal so 15.6GB doesn't round up past a 16GB minimum.
  const rounded = Math.floor(gb * 10) / 10
  return Number.isInteger(rounded)
    ? `${rounded} GB`
    : `${rounded.toFixed(1)} GB`
}
