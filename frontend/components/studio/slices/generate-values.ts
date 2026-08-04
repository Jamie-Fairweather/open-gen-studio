import type {
  BlueprintDetail,
  LoraPack,
  LoraStackEntry,
  StudioTab,
} from "@/lib/host"
import { DEFAULT_UPSCALE_MODEL_ID } from "./helpers"

/** Build the generate payload values object from current studio state. */
export function buildGenerateValues(input: {
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
}): Record<string, unknown> {
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
