import { isTauri, setSetting, type LoraStackEntry } from "@/lib/host"
import type {
  PromptFormatId,
  PromptTargetId,
  StructuredFields,
} from "@/lib/prompt-tools"
import { studioRefs } from "../studio-refs"
import { DEFAULT_UPSCALE_MODEL_ID, SETTING_STUDIO_SESSION } from "./helpers"

export { SETTING_STUDIO_SESSION }

const DEBOUNCE_MS = 400

const KNOWN_TOOLS_PATHS = new Set([
  "/tools",
  "/tools/image-to-prompt",
  "/tools/prompt-enhancer",
])

const PROMPT_FORMATS = new Set<string>([
  "general",
  "structured",
  "graphicDesign",
  "json",
])

const PROMPT_TARGETS = new Set<string>([
  "auto",
  "flux",
  "stableDiffusion",
  "ideogram",
  "zImageKrea",
])

export type PersistedImageToPrompt = {
  imagePath: string | null
  previewUrl: string | null
  format: PromptFormatId
  target: PromptTargetId
  result: string
  negative: string | null
  fields: StructuredFields | null
  galleryOpen: boolean
}

export type PersistedPromptEnhance = {
  input: string
  result: string
  negative: string | null
  target: PromptTargetId
  mode: string
  styleLook: string
  seeded: boolean
}

export type StudioSessionV1 = {
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
  toolsPath: string | null
  imageToPrompt: PersistedImageToPrompt
  promptEnhance: PersistedPromptEnhance
}

/** Minimal store shape needed to serialize a session. */
export type StudioSessionSource = {
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
  imageToPrompt: {
    imagePath: string | null
    previewUrl: string | null
    format: PromptFormatId
    target: PromptTargetId
    result: string
    negative: string | null
    fields: StructuredFields | null
    galleryOpen: boolean
  }
  promptEnhance: {
    input: string
    result: string
    negative: string | null
    target: PromptTargetId
    mode: string
    styleLook: string
    seeded: boolean
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let getSource: (() => StudioSessionSource) | null = null

export function bindSessionPersist(get: () => StudioSessionSource) {
  getSource = get
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

export function serializeStudioSession(
  state: StudioSessionSource
): StudioSessionV1 {
  return {
    v: 1,
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

function parseFormat(v: unknown): PromptFormatId {
  const s = asString(v, "general")
  return (PROMPT_FORMATS.has(s) ? s : "general") as PromptFormatId
}

function parseTarget(v: unknown): PromptTargetId {
  const s = asString(v, "auto")
  return (PROMPT_TARGETS.has(s) ? s : "auto") as PromptTargetId
}

function parseFields(raw: unknown): StructuredFields | null {
  if (!isRecord(raw)) return null
  return raw as StructuredFields
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

export function parseStudioSession(
  raw: string | undefined | null
): StudioSessionV1 | null {
  if (!raw?.trim()) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.v !== 1) return null
    const usduScale = asNumber(data.usduScale, 2)
    const toolsPath = asString(data.toolsPath).trim() || null
    return {
      v: 1,
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
      toolsPath: isKnownToolsPath(toolsPath) ? toolsPath : null,
      imageToPrompt: parseImageToPrompt(data.imageToPrompt),
      promptEnhance: parsePromptEnhance(data.promptEnhance),
    }
  } catch {
    return null
  }
}

/** Overlay saved control values onto blueprint defaults; only known control ids. */
export function overlayControlValues(
  defaults: Record<string, unknown>,
  saved: Record<string, unknown>,
  controlIds: Iterable<string>
): Record<string, unknown> {
  const allowed = new Set(controlIds)
  const next = { ...defaults }
  for (const [key, value] of Object.entries(saved)) {
    if (allowed.has(key)) next[key] = value
  }
  return next
}

export function overlaySessionControls(
  defaults: Record<string, unknown>,
  session: StudioSessionV1,
  controlIds: Iterable<string>
): Record<string, unknown> {
  return overlayControlValues(defaults, session.controlValues, controlIds)
}

export function filterSessionLoras(
  stack: LoraStackEntry[],
  knownIds: Set<string>
): LoraStackEntry[] {
  return stack.filter((e) => knownIds.has(e.id))
}

export function resolveSessionUpscaleModelId(
  modelId: string,
  knownIds: Set<string>
): string {
  if (knownIds.has(modelId)) return modelId
  if (knownIds.has(DEFAULT_UPSCALE_MODEL_ID)) return DEFAULT_UPSCALE_MODEL_ID
  return modelId || DEFAULT_UPSCALE_MODEL_ID
}

function writeSession(state: StudioSessionSource) {
  const payload = JSON.stringify(serializeStudioSession(state))
  void setSetting(SETTING_STUDIO_SESSION, payload).catch(() => {})
}

export function schedulePersistSession() {
  if (!isTauri() || studioRefs.suppressSessionPersist || !getSource) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    const src = getSource?.()
    if (src) writeSession(src)
  }, DEBOUNCE_MS)
}

export function flushPersistSession() {
  if (!isTauri() || studioRefs.suppressSessionPersist || !getSource) return
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const src = getSource()
  if (src) writeSession(src)
}
