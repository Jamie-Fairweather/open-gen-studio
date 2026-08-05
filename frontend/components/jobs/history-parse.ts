import type { JobHistoryItem } from "@/lib/host"

export type HistoryParsed = {
  thumb: JobHistoryItem["galleryItems"][number] | undefined
  /** Generate prompt, or single tool output when there is no separate input. */
  prompt: string | null
  /** Prompt Enhancer input (original idea). */
  inputPrompt: string | null
  /** Prompt tool output (enhanced / image→prompt). */
  outputPrompt: string | null
  /** Image→Prompt source path from params. */
  inputImagePath: string | null
  isEnhance: boolean
  metaLine: string | null
  sizeLabel: string | null
  seedLabel: string | null
}

const historyParseCache = new Map<string, HistoryParsed>()

export function parseHistoryItem(item: JobHistoryItem): HistoryParsed {
  const thumb = item.galleryItems[0]
  const key = `${item.jobId}:${item.updatedAt}:${thumb?.id ?? ""}`
  const cached = historyParseCache.get(key)
  if (cached) return cached

  let prompt: string | null = null
  let inputPrompt: string | null = null
  let outputPrompt: string | null = null
  let inputImagePath: string | null = null
  let isEnhance = false
  let metaLine: string | null = null
  let sizeLabel: string | null = null
  let seedLabel: string | null = null
  try {
    if (thumb?.metadataJson) {
      const meta = JSON.parse(thumb.metadataJson) as {
        prompt?: string
        values?: Record<string, unknown>
      }
      prompt = meta.prompt ?? null
      const w = meta.values?.width
      const h = meta.values?.height
      const seed = meta.values?.seed
      if (w && h) sizeLabel = `${w}×${h}`
      if (seed != null && seed !== "") seedLabel = String(seed)
      metaLine = [sizeLabel, seedLabel ? `seed ${seedLabel}` : null]
        .filter(Boolean)
        .join(" · ")
    } else if (item.kind === "prompt-tool") {
      const params = JSON.parse(item.paramsJson) as {
        prompt?: string
        imagePath?: string
        format?: string
        mode?: string
        result?: { prompt?: string; format?: string }
      }
      const resultPrompt =
        typeof params.result?.prompt === "string" ? params.result.prompt : null
      inputImagePath =
        typeof params.imagePath === "string" && params.imagePath
          ? params.imagePath
          : null
      isEnhance =
        typeof params.prompt === "string" &&
        !inputImagePath &&
        (params.result?.format === "enhance" || params.mode != null)
      if (isEnhance) {
        inputPrompt = params.prompt?.trim() ? params.prompt : null
        outputPrompt = resultPrompt
        prompt = resultPrompt ?? inputPrompt
      } else {
        outputPrompt = resultPrompt
        prompt = resultPrompt
      }
      metaLine = [params.format, params.mode].filter(Boolean).join(" · ")
    }
  } catch {
    /* ignore */
  }
  const parsed = {
    thumb,
    prompt,
    inputPrompt,
    outputPrompt,
    inputImagePath,
    isEnhance,
    metaLine,
    sizeLabel,
    seedLabel,
  }
  if (historyParseCache.size > 2500) historyParseCache.clear()
  historyParseCache.set(key, parsed)
  return parsed
}
