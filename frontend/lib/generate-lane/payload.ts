import { DEFAULT_UPSCALE_MODEL_ID } from "@/components/studio/slices/setting-keys"
import type { BuildGenerateValuesInput } from "./types"

/** Compile studio controls into the host generate payload. */
export function buildGenerateValues(
  input: BuildGenerateValuesInput
): Record<string, unknown> {
  const values: Record<string, unknown> = {
    ...input.controlValues,
    prompt: input.prompt.trim(),
  }

  const cfgValue = Number(
    input.controlValues.cfg ??
      input.activeDetail?.controls?.find((c) => c.id === "cfg")?.default ??
      1
  )
  const hasNegativePrompt = Boolean(
    input.activeDetail?.capabilities?.negative && cfgValue > 1
  )
  if (hasNegativePrompt) {
    values.negative = String(input.controlValues.negative ?? "").trim()
  } else {
    delete values.negative
  }

  const supportsLoras = Boolean(input.activeDetail?.capabilities?.loras)
  const activeLoraStack = input.activeArch
    ? input.loraStack.filter((entry) =>
        input.loraPacks.some(
          (p) =>
            p.id === entry.id &&
            p.variants.some((v) => v.arch === input.activeArch)
        )
      )
    : []
  if (supportsLoras && activeLoraStack.length > 0) {
    values.loras = activeLoraStack
  } else {
    delete values.loras
  }

  if (input.studioTab === "image" && input.upscaleEnabled) {
    values.upscale = {
      modelId: input.upscaleModelId || DEFAULT_UPSCALE_MODEL_ID,
      usdu: input.usduEnabled,
      ...(input.usduEnabled
        ? {
            usduScale: input.usduScale,
            usduSteps: input.usduSteps,
            usduDenoise: input.usduDenoise,
          }
        : {}),
    }
  } else {
    delete values.upscale
  }

  return values
}
