import {
  emptyStructuredFields,
  STRUCTURED_FIELDS,
  type PromptFormatId,
  type PromptTargetId,
  type StructuredFields,
} from "@/lib/prompt-tools"
import type {
  PersistedImageToPrompt,
  PersistedPromptEnhance,
  ToolsSessionSource,
  ToolsSessionV1,
} from "./types"

const KNOWN_TOOLS_PATHS = new Set([
  "/tools",
  "/tools/image-to-prompt",
  "/tools/prompt-enhancer",
])

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

export function isKnownToolsPath(
  path: string | null | undefined
): path is string {
  return Boolean(path && KNOWN_TOOLS_PATHS.has(path))
}

/** Current tools route, or null when not on /tools (so reopen stays on image). */
export function currentToolsPath(): string | null {
  if (typeof window === "undefined") return null
  const path = window.location.pathname
  return isKnownToolsPath(path) ? path : null
}

function parseFormat(v: unknown): PromptFormatId {
  const s = asString(v, "general")
  if (s === "structured" || s === "graphicDesign" || s === "json") return s
  return "general"
}

function parseTarget(v: unknown): PromptTargetId {
  const s = asString(v, "auto")
  if (
    s === "flux" ||
    s === "stableDiffusion" ||
    s === "ideogram" ||
    s === "qwenImage" ||
    s === "zImageKrea"
  ) {
    return s
  }
  return "auto"
}

function parseFields(raw: unknown): StructuredFields | null {
  if (!isRecord(raw)) return null
  const next = emptyStructuredFields()
  for (const key of STRUCTURED_FIELDS) {
    const v = raw[key]
    if (typeof v === "string") next[key] = v
  }
  return next
}

function parseImageToPrompt(raw: unknown): PersistedImageToPrompt {
  const o = isRecord(raw) ? raw : {}
  return {
    imagePath: typeof o.imagePath === "string" ? o.imagePath : null,
    previewUrl: typeof o.previewUrl === "string" ? o.previewUrl : null,
    format: parseFormat(o.format),
    target: parseTarget(o.target),
    result: asString(o.result),
    negative: typeof o.negative === "string" ? o.negative : null,
    fields: parseFields(o.fields),
    galleryOpen: asBool(o.galleryOpen),
  }
}

function parsePromptEnhance(raw: unknown): PersistedPromptEnhance {
  const o = isRecord(raw) ? raw : {}
  return {
    input: asString(o.input),
    result: asString(o.result),
    negative: typeof o.negative === "string" ? o.negative : null,
    target: parseTarget(o.target),
    mode: asString(o.mode, "expand") || "expand",
    styleLook: asString(o.styleLook, "cinematic") || "cinematic",
    seeded: asBool(o.seeded),
  }
}

export function serializeToolsSession(
  state: ToolsSessionSource
): ToolsSessionV1 {
  return {
    toolsPath: currentToolsPath(),
    imageToPrompt: {
      imagePath: state.imageToPrompt.imagePath,
      previewUrl: state.imageToPrompt.previewUrl,
      format: state.imageToPrompt.format,
      target: state.imageToPrompt.target,
      result: state.imageToPrompt.result,
      negative: state.imageToPrompt.negative,
      fields: state.imageToPrompt.fields,
      galleryOpen: state.imageToPrompt.galleryOpen,
    },
    promptEnhance: {
      input: state.promptEnhance.input,
      result: state.promptEnhance.result,
      negative: state.promptEnhance.negative,
      target: state.promptEnhance.target,
      mode: state.promptEnhance.mode,
      styleLook: state.promptEnhance.styleLook,
      seeded: state.promptEnhance.seeded,
    },
  }
}

export function parseToolsSessionFields(
  data: Record<string, unknown>
): ToolsSessionV1 {
  const toolsPath = asString(data.toolsPath).trim() || null
  return {
    toolsPath: isKnownToolsPath(toolsPath) ? toolsPath : null,
    imageToPrompt: parseImageToPrompt(data.imageToPrompt),
    promptEnhance: parsePromptEnhance(data.promptEnhance),
  }
}
