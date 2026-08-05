import type { BlueprintDetail } from "@/lib/host"
import {
  applyReuseAllSettings,
  lorasFromRecipe,
  upscaleFromRecipe,
} from "@/lib/blueprint-helpers"
import {
  SIDE_LENGTH_DEFAULT,
  sizeFromAspectAndSide,
  syncSizeControls,
} from "@/lib/image-size"
import {
  flushPersistSession,
  overlayControlValues,
  overlaySessionControls,
} from "@/components/studio/slices/session-persist"
import { useStudioStore } from "@/components/studio/store"
import { studioRefs } from "@/components/studio/studio-refs"
import { tryMarkStartupHydrated } from "@/components/studio/bootstrap/startup-hydrate"

type Store = ReturnType<typeof useStudioStore.getState>

/** Parse width/height from control values and sync aspect/side length into the store. */
export function applySyncedSizeFromValues(
  store: Store,
  values: Record<string, unknown>,
  options: { persistToRefs: boolean }
): { width: number; height: number } | null {
  const width = Number(values.width)
  const height = Number(values.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  const synced = syncSizeControls(width, height)
  if (options.persistToRefs) {
    studioRefs.aspectId = synced.aspectId
    studioRefs.sideLength = synced.sideLength
  }
  store.setAspectId(synced.aspectId)
  store.setSideLength(synced.sideLength)
  return { width, height }
}

function resolveSizeControls(
  store: Store,
  detail: BlueprintDetail,
  values: Record<string, unknown>,
  opts: {
    recipe: NonNullable<typeof studioRefs.pendingRecipe> | null
    session: NonNullable<typeof studioRefs.pendingSession> | null
    restoredControls: boolean
  }
): Record<string, unknown> {
  const hasW = detail.controls.some((c) => c.id === "width")
  const hasH = detail.controls.some((c) => c.id === "height")
  if (!hasW || !hasH) return values

  const { recipe, session, restoredControls } = opts
  if (recipe) {
    applySyncedSizeFromValues(store, values, { persistToRefs: false })
    return values
  }
  if (restoredControls) {
    const synced = applySyncedSizeFromValues(store, values, {
      persistToRefs: true,
    })
    if (synced) {
      return { ...values, width: synced.width, height: synced.height }
    }
    if (session) {
      const sized = sizeFromAspectAndSide(
        session.aspectId,
        session.sideLength || SIDE_LENGTH_DEFAULT
      )
      return { ...values, ...sized }
    }
    const { width: w, height: h } = sizeFromAspectAndSide(
      studioRefs.aspectId,
      studioRefs.sideLength || SIDE_LENGTH_DEFAULT
    )
    return { ...values, width: w, height: h }
  }
  const { width, height } = sizeFromAspectAndSide(
    studioRefs.aspectId,
    studioRefs.sideLength || SIDE_LENGTH_DEFAULT
  )
  return { ...values, width, height }
}

/** Build control-value defaults from per-control defaults, then pack overrides. */
export function defaultsFromBlueprintDetail(
  detail: BlueprintDetail
): Record<string, unknown> {
  const controlIds = new Set(detail.controls.map((c) => c.id))
  const next: Record<string, unknown> = {}
  for (const c of detail.controls) {
    if (c.default !== undefined) {
      next[c.id] = c.default
    }
  }
  // Manifest pack defaults win (e.g. Krea 2 Turbo steps/CFG over arch fallbacks).
  const packDefaults = detail.defaults
  if (packDefaults && typeof packDefaults === "object") {
    for (const [key, value] of Object.entries(packDefaults)) {
      if (controlIds.has(key)) next[key] = value
    }
  }
  return next
}

/**
 * Apply a freshly loaded blueprint detail into the studio store, resolving
 * recipe reuse, pending session, or stashed control values.
 */
export function applyLoadedBlueprintDetail(detail: BlueprintDetail): void {
  const store = useStudioStore.getState()
  const prevDetailId = store.detail?.id ?? null
  const prevControlValues = store.controlValues
  const forceDefaults = studioRefs.forceBlueprintDefaults
  studioRefs.forceBlueprintDefaults = false
  // Snapshot leaving blueprint so image↔video/audio round-trips keep seed/etc.
  if (prevDetailId && prevDetailId !== detail.id) {
    studioRefs.controlValuesByBlueprintId[prevDetailId] = {
      ...prevControlValues,
    }
  }
  store.setDetail(detail)
  const recipe = studioRefs.pendingRecipe
  studioRefs.pendingRecipe = null
  // Recipe (user reuse) wins over restored session for this detail load.
  // Explicit picker/onboarding select skips session so pack steps/CFG apply.
  const session = recipe || forceDefaults ? null : studioRefs.pendingSession
  if (recipe || studioRefs.pendingSession) {
    studioRefs.pendingSession = null
  }
  const controlIds = detail.controls.map((c) => c.id)
  const next = defaultsFromBlueprintDetail(detail)
  let values = recipe ? applyReuseAllSettings(next, recipe) : next
  let restoredControls = false
  if (recipe) {
    store.setLoraStack(lorasFromRecipe(recipe, studioRefs.loraPacks))
    const up = upscaleFromRecipe(recipe, detail.arch)
    store.setUpscaleEnabled(up.enabled)
    store.setUpscaleModelId(up.modelId)
    store.setUsduEnabled(up.usduEnabled)
    store.setUsduScale(up.usduScale)
    store.setUsduSteps(up.usduSteps)
    store.setUsduDenoise(up.usduDenoise)
  } else if (session) {
    values = overlaySessionControls(next, session, controlIds)
    studioRefs.aspectId = session.aspectId
    studioRefs.sideLength = session.sideLength
    store.setAspectId(session.aspectId)
    store.setSideLength(session.sideLength)
    restoredControls = true
  } else if (!forceDefaults && prevDetailId === detail.id) {
    // Same blueprint re-load (e.g. effect re-run) — keep live values.
    values = overlayControlValues(next, prevControlValues, controlIds)
    restoredControls = true
  } else if (!forceDefaults) {
    const stashed = studioRefs.controlValuesByBlueprintId[detail.id]
    if (stashed) {
      values = overlayControlValues(next, stashed, controlIds)
      restoredControls = true
    }
  }
  values = resolveSizeControls(store, detail, values, {
    recipe,
    session,
    restoredControls,
  })
  store.setControlValues(values)
  if (recipe?.prompt) {
    store.setPrompt(recipe.prompt)
  }
  const hadSession = Boolean(session)
  studioRefs.suppressSessionPersist = false
  tryMarkStartupHydrated()
  if (hadSession) flushPersistSession()
}
