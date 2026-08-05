import { isInstalled } from "@/lib/blueprint-helpers"
import type { Blueprint, GpuInfo, RuntimeInstall } from "@/lib/host"

export const SETTING_ONBOARDING = "ui_onboarding_v1"

export type OnboardingStep = "gpu" | "hf" | "blueprint" | "install"

export type OnboardingState = {
  step: OnboardingStep
  blueprintId: string | null
  hfSkipped: boolean
}

export const ONBOARDING_RECOMMENDED: {
  id: string
  blurb: string
}[] = [
  {
    id: "krea2-turbo",
    blurb: "Best balance of quality and speed",
  },
  {
    id: "flux2-dev",
    blurb: "Highest quality",
  },
  {
    id: "z-image-turbo",
    blurb: "Faster on lower-end GPUs",
  },
]

export function parseOnboardingState(
  raw: string | null | undefined
): OnboardingState | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    if (
      parsed.step !== "gpu" &&
      parsed.step !== "hf" &&
      parsed.step !== "blueprint" &&
      parsed.step !== "install"
    ) {
      return null
    }
    return {
      step: parsed.step,
      blueprintId:
        typeof parsed.blueprintId === "string" && parsed.blueprintId.trim()
          ? parsed.blueprintId
          : null,
      hfSkipped: Boolean(parsed.hfSkipped),
    }
  } catch {
    return null
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state)
}

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

export function isComfyInstalling(
  runtimes: RuntimeInstall[] | null | undefined
): boolean {
  const comfy = runtimes?.find((r) => r.engine === "comfyui")
  return comfy?.status === "installing"
}

export function hasInstalledOfficialBlueprint(
  blueprints: Blueprint[] | null | undefined
): boolean {
  return (blueprints ?? []).some(
    (bp) => bp.source === "official" && isInstalled(bp)
  )
}

/** Studio stays gated until Comfy + at least one Official blueprint are ready. */
export function needsOnboarding(
  runtimes: RuntimeInstall[] | null | undefined,
  blueprints: Blueprint[] | null | undefined
): boolean {
  return !isComfyReady(runtimes) || !hasInstalledOfficialBlueprint(blueprints)
}

export function needsGpuStep(
  gpu: GpuInfo | null,
  savedVendor: string | null | undefined
): boolean {
  if (!gpu?.needsVendorChoice) return false
  return !savedVendor?.trim()
}

/**
 * First-run order: GPU (if needed) → Blueprint → HF token → Install.
 * Gated blueprints stay out of the picker; HF is optional after they've seen one.
 */
export function resolveOnboardingStep(opts: {
  persisted: OnboardingState | null
  gpu: GpuInfo | null
  savedVendor: string | null | undefined
}): OnboardingStep {
  const { persisted, gpu, savedVendor } = opts
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
  return needsGpuStep(gpu, savedVendor) ? "gpu" : "blueprint"
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

export function recommendedBlurb(id: string): string | null {
  return ONBOARDING_RECOMMENDED.find((r) => r.id === id)?.blurb ?? null
}
