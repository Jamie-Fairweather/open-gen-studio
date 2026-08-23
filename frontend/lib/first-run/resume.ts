import { ONBOARDING_RECOMMENDED, resolveOnboardingStep } from "./helpers"
import type { ResumeFirstRunInput, ResumeFirstRunResult } from "./types"

function pickBlueprintId(
  catalog: readonly { id: string }[],
  preferred: string | null | undefined
): string | null {
  if (preferred && catalog.some((row) => row.id === preferred)) {
    return preferred
  }
  const recommendedId = ONBOARDING_RECOMMENDED[0]?.id
  return (
    catalog.find((row) => row.id === recommendedId)?.id ??
    catalog[0]?.id ??
    null
  )
}

/** Restore first-run step + Blueprint pick from persisted progress and Catalog. */
export function resumeFirstRun(
  input: ResumeFirstRunInput
): ResumeFirstRunResult {
  const step = resolveOnboardingStep({
    persisted: input.persisted,
    gpu: input.gpu,
    savedVendor: input.savedVendor,
    storageChosen: input.storageChosen,
    specs: input.specs,
  })
  const blueprintId = pickBlueprintId(
    input.catalog,
    input.persisted?.blueprintId
  )
  return {
    step:
      step === "hf" && input.hasHfToken
        ? blueprintId
          ? "install"
          : "blueprint"
        : step,
    blueprintId,
    hfSkipped: Boolean(input.persisted?.hfSkipped),
    specsBypassed: Boolean(input.persisted?.specsBypassed),
  }
}
