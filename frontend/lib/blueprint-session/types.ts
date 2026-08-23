import type { LoraStackEntry } from "@/lib/host"

/** Image-page fields restored after Blueprint detail merge. */
export type ImageSessionV1 = {
  v: 1
  prompt: string
  aspectId: string
  sideLength: number
  controlValues: Record<string, unknown>
  loraStack: LoraStackEntry[]
  upscaleEnabled: boolean
  upscaleModelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  usduSteps: number
  usduDenoise: number
  selectedGalleryId: string | null
  followLive: boolean
}

/** Minimal store shape needed to serialize the image page. */
export type ImageSessionSource = {
  prompt: string
  aspectId: string
  sideLength: number
  controlValues: Record<string, unknown>
  loraStack: LoraStackEntry[]
  upscaleEnabled: boolean
  upscaleModelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  usduSteps: number
  usduDenoise: number
  selectedGalleryId: string | null
  followLive: boolean
}
