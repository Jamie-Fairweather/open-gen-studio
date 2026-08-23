import type { LoraStackEntry } from "@/lib/host"
import { DEFAULT_UPSCALE_MODEL_ID } from "@/components/studio/slices/setting-keys"
import type { ImageSessionSource, ImageSessionV1 } from "./types"

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback
}

function parseLoraStack(raw: unknown): LoraStackEntry[] {
  if (!Array.isArray(raw)) return []
  const out: LoraStackEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = asString(item.id).trim()
    const strength = asNumber(item.strength, NaN)
    if (!id || !Number.isFinite(strength)) continue
    out.push({ id, strength })
  }
  return out
}

export function serializeImageSession(
  state: ImageSessionSource
): Omit<ImageSessionV1, "v"> {
  return {
    prompt: state.prompt,
    aspectId: state.aspectId,
    sideLength: state.sideLength,
    controlValues: { ...state.controlValues },
    loraStack: state.loraStack.map((e) => ({
      id: e.id,
      strength: e.strength,
    })),
    upscaleEnabled: state.upscaleEnabled,
    upscaleModelId: state.upscaleModelId,
    usduEnabled: state.usduEnabled,
    usduScale: state.usduScale === 4 ? 4 : 2,
    usduSteps: state.usduSteps,
    usduDenoise: state.usduDenoise,
    selectedGalleryId: state.selectedGalleryId,
    followLive: state.followLive,
  }
}

export function parseImageSessionFields(
  data: Record<string, unknown>
): Omit<ImageSessionV1, "v"> {
  const usduScale = asNumber(data.usduScale, 2)
  return {
    prompt: asString(data.prompt),
    aspectId: asString(data.aspectId, "1:1") || "1:1",
    sideLength: asNumber(data.sideLength, 1024),
    controlValues: isRecord(data.controlValues)
      ? { ...data.controlValues }
      : {},
    loraStack: parseLoraStack(data.loraStack),
    upscaleEnabled: asBool(data.upscaleEnabled),
    upscaleModelId:
      asString(data.upscaleModelId, DEFAULT_UPSCALE_MODEL_ID) ||
      DEFAULT_UPSCALE_MODEL_ID,
    usduEnabled: asBool(data.usduEnabled),
    usduScale: usduScale === 4 ? 4 : 2,
    usduSteps: asNumber(data.usduSteps, 8),
    usduDenoise: asNumber(data.usduDenoise, 0.15),
    selectedGalleryId:
      typeof data.selectedGalleryId === "string"
        ? data.selectedGalleryId
        : null,
    followLive: asBool(data.followLive, true),
  }
}

export function applyImageFieldsToSource<T extends ImageSessionSource>(
  target: T,
  image: Omit<ImageSessionV1, "v">
): T {
  return {
    ...target,
    prompt: image.prompt,
    aspectId: image.aspectId,
    sideLength: image.sideLength,
    controlValues: { ...image.controlValues },
    loraStack: image.loraStack.map((e) => ({
      id: e.id,
      strength: e.strength,
    })),
    upscaleEnabled: image.upscaleEnabled,
    upscaleModelId: image.upscaleModelId,
    usduEnabled: image.usduEnabled,
    usduScale: image.usduScale,
    usduSteps: image.usduSteps,
    usduDenoise: image.usduDenoise,
    selectedGalleryId: image.selectedGalleryId,
    followLive: image.followLive,
  }
}
