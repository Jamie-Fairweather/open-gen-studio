import { isTauri, setSetting } from "@/lib/host"
import {
  applyImageFieldsToSource,
  parseImageSessionFields,
  serializeImageSession,
} from "@/lib/blueprint-session/image-persist"
import { blueprintSession } from "@/lib/blueprint-session/state"
import type {
  ImageSessionSource,
  ImageSessionV1,
} from "@/lib/blueprint-session/types"
import {
  currentToolsPath,
  isKnownToolsPath,
  parseToolsSessionFields,
  serializeToolsSession,
} from "@/lib/tools-session/persist"
import type {
  PersistedImageToPrompt,
  PersistedPromptEnhance,
  ToolsSessionSource,
} from "@/lib/tools-session/types"
import { SETTING_STUDIO_SESSION } from "./helpers"

export { SETTING_STUDIO_SESSION }
export { currentToolsPath, isKnownToolsPath }
export {
  filterSessionLoras,
  overlayControlValues,
  overlaySessionControls,
  resolveSessionUpscaleModelId,
} from "@/lib/blueprint-session/overlay"

const DEBOUNCE_MS = 400

export type { PersistedImageToPrompt, PersistedPromptEnhance }

/** Persisted v1 studio session: image fields plus tools path and prompt-tool drafts. */
export type StudioSessionV1 = ImageSessionV1 & {
  toolsPath: string | null
  imageToPrompt: PersistedImageToPrompt
  promptEnhance: PersistedPromptEnhance
}

/** Minimal store shape needed to serialize a session. */
export type StudioSessionSource = ImageSessionSource & ToolsSessionSource

let debounceImage: ReturnType<typeof setTimeout> | null = null
let debounceTools: ReturnType<typeof setTimeout> | null = null
let getSource: (() => StudioSessionSource) | null = null

/** Wire the persist writer to the live store getter. */
export function bindSessionPersist(get: () => StudioSessionSource) {
  getSource = get
}

/** Compose image + tools fields into the v1 session blob. */
export function serializeStudioSession(
  state: StudioSessionSource
): StudioSessionV1 {
  return {
    v: 1,
    ...serializeImageSession(state),
    ...serializeToolsSession(state),
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Parse a stored session JSON; null on empty, wrong version, or corrupt payload. */
export function parseStudioSession(
  raw: string | undefined | null
): StudioSessionV1 | null {
  if (!raw?.trim()) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.v !== 1) return null
    return {
      v: 1,
      ...parseImageSessionFields(data),
      ...parseToolsSessionFields(data),
    }
  } catch {
    return null
  }
}

function writeComposed(state: StudioSessionSource) {
  const payload = JSON.stringify(serializeStudioSession(state))
  void setSetting(SETTING_STUDIO_SESSION, payload).catch(() => {})
}

/** Image persist is gated; tools persist during the gate keeps pending image fields. */
function sourceForWrite(page: "image" | "tools"): StudioSessionSource | null {
  const src = getSource?.()
  if (!src) return null
  if (page === "image") return src
  if (!blueprintSession.suppressImagePersist) return src
  const pending = blueprintSession.pendingSession
  if (!pending) return src
  return applyImageFieldsToSource(src, pending)
}

function persistNow(page: "image" | "tools") {
  if (!isTauri() || !getSource) return
  if (page === "image" && blueprintSession.suppressImagePersist) return
  const src = sourceForWrite(page)
  if (src) writeComposed(src)
}

function clearTimer(which: "image" | "tools") {
  if (which === "image" && debounceImage) {
    clearTimeout(debounceImage)
    debounceImage = null
  }
  if (which === "tools" && debounceTools) {
    clearTimeout(debounceTools)
    debounceTools = null
  }
}

/** Debounced image-session write; no-ops while the hydrate persist gate is on. */
export function schedulePersistImageSession() {
  if (!isTauri() || blueprintSession.suppressImagePersist || !getSource) return
  clearTimer("image")
  debounceImage = setTimeout(() => {
    debounceImage = null
    persistNow("image")
  }, DEBOUNCE_MS)
}

/** Immediate image-session write; no-ops while the hydrate persist gate is on. */
export function flushPersistImageSession() {
  if (!isTauri() || blueprintSession.suppressImagePersist || !getSource) return
  clearTimer("image")
  persistNow("image")
}

/** Debounced tools-session write (path + prompt-tool drafts). */
export function schedulePersistToolsSession() {
  if (!isTauri() || !getSource) return
  clearTimer("tools")
  debounceTools = setTimeout(() => {
    debounceTools = null
    persistNow("tools")
  }, DEBOUNCE_MS)
}

/** Immediate tools-session write (path + prompt-tool drafts). */
export function flushPersistToolsSession() {
  if (!isTauri() || !getSource) return
  clearTimer("tools")
  persistNow("tools")
}

/** Image + tools. Image writes no-op while the persist gate is on. */
export function schedulePersistSession() {
  schedulePersistImageSession()
  schedulePersistToolsSession()
}

/** Flush image + tools now. Image writes no-op while the persist gate is on. */
export function flushPersistSession() {
  flushPersistImageSession()
  flushPersistToolsSession()
}
