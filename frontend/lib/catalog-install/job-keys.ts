export function blueprintIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("blueprint:")
    ? jobKey.slice("blueprint:".length)
    : null
}

export function loraKeyFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("lora:") ? jobKey.slice("lora:".length) : null
}

export function upscaleIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("upscale:") ? jobKey.slice("upscale:".length) : null
}

/** Shared Qwen-VL install job key prefix used by Prompt Tools providers. */
export function promptToolsModelIdFromJobKey(jobKey: string): string | null {
  return jobKey.startsWith("prompt-tools:")
    ? jobKey.slice("prompt-tools:".length)
    : null
}

export function isPromptToolsJobKey(jobKey: string): boolean {
  return jobKey.startsWith("prompt-tools:")
}

export function isCivitaiUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes("civitai.com") || lower.includes("civitai.red")
}
