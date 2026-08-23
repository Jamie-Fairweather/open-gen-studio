/** Strip `blueprint:` jobKey prefix to a catalog id; null if the prefix is absent. */
export function blueprintIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("blueprint:")
    ? jobKey.slice("blueprint:".length)
    : null
}

/** Strip `lora:` jobKey prefix to the pack key; null if not a LoRA job. */
export function loraKeyFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("lora:") ? jobKey.slice("lora:".length) : null
}

/** Strip `upscale:` jobKey prefix to a catalog upscale id. */
export function upscaleIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("upscale:") ? jobKey.slice("upscale:".length) : null
}

/** Shared Qwen-VL install job key prefix used by Prompt Tools providers. */
export function promptToolsModelIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("prompt-tools:")
    ? jobKey.slice("prompt-tools:".length)
    : null
}

/** True when the download belongs to Prompt Tools (Qwen-VL) rather than Catalog. */
export function isPromptToolsJobKey(jobKey: string): boolean {
  return jobKey.startsWith("prompt-tools:")
}

/** True for Civitai CDN / page URLs (token gate uses this). */
export function isCivitaiUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes("civitai.com") || lower.includes("civitai.red")
}
