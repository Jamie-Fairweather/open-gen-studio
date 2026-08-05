import { beforeEach, describe, expect, it, vi } from "vitest"
import type { BlueprintDetail } from "@/lib/host"
import { studioRefs } from "@/components/studio/studio-refs"
import type { StudioSessionV1 } from "@/components/studio/slices/session-persist"

const setAspectId = vi.fn()
const setSideLength = vi.fn()
const setDetail = vi.fn()
const setControlValues = vi.fn()
const setPrompt = vi.fn()
const setLoraStack = vi.fn()
const setUpscaleEnabled = vi.fn()
const setUpscaleModelId = vi.fn()
const setUsduEnabled = vi.fn()
const setUsduScale = vi.fn()
const setUsduSteps = vi.fn()
const setUsduDenoise = vi.fn()
const setStartupHydrated = vi.fn()

const state = {
  detail: null as BlueprintDetail | null,
  controlValues: {} as Record<string, unknown>,
  startupHydrated: false,
  blueprintsLoaded: true,
  galleryLoaded: true,
  setAspectId,
  setSideLength,
  setDetail,
  setControlValues,
  setPrompt,
  setLoraStack,
  setUpscaleEnabled,
  setUpscaleModelId,
  setUsduEnabled,
  setUsduScale,
  setUsduSteps,
  setUsduDenoise,
  setStartupHydrated,
}

vi.mock("@/components/studio/store", () => ({
  useStudioStore: {
    getState: () => state,
  },
}))

vi.mock(
  "@/components/studio/slices/session-persist",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/studio/slices/session-persist")
      >()
    return {
      ...actual,
      flushPersistSession: vi.fn(),
    }
  }
)

import {
  applyLoadedBlueprintDetail,
  applySyncedSizeFromValues,
  defaultsFromBlueprintDetail,
} from "./bootstrap-helpers"

function detail(partial: Partial<BlueprintDetail> = {}): BlueprintDetail {
  return {
    id: "bp1",
    name: "BP",
    category: "image",
    description: "",
    runtime: "comfy",
    minimumVramGb: null,
    modelCount: 1,
    modelsReady: 1,
    arch: "flux",
    controls: [
      {
        id: "width",
        type: "number",
        nodeId: "1",
        input: "width",
        default: 1024,
      },
      {
        id: "height",
        type: "number",
        nodeId: "1",
        input: "height",
        default: 1024,
      },
      { id: "seed", type: "number", nodeId: "1", input: "seed", default: 0 },
    ],
    ...partial,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.detail = null
  state.controlValues = {}
  state.startupHydrated = false
  studioRefs.pendingRecipe = null
  studioRefs.pendingSession = null
  studioRefs.controlValuesByBlueprintId = {}
  studioRefs.forceBlueprintDefaults = false
  studioRefs.aspectId = "1:1"
  studioRefs.sideLength = 1024
  studioRefs.loraPacks = []
  studioRefs.suppressSessionPersist = true
  studioRefs.startupCatalogReady = true
})

describe("applySyncedSizeFromValues", () => {
  it("syncs aspect/side or returns null", () => {
    expect(
      applySyncedSizeFromValues(
        state as never,
        { width: "x" },
        {
          persistToRefs: false,
        }
      )
    ).toBeNull()
    const synced = applySyncedSizeFromValues(
      state as never,
      { width: 1920, height: 1080 },
      { persistToRefs: true }
    )
    expect(synced).toEqual({ width: 1920, height: 1080 })
    expect(studioRefs.aspectId).toBe("16:9")
    expect(setAspectId).toHaveBeenCalledWith("16:9")
  })
})

describe("applyLoadedBlueprintDetail", () => {
  it("applies defaults, recipe reuse, session, stash, and same-id reload", () => {
    applyLoadedBlueprintDetail(detail())
    expect(setDetail).toHaveBeenCalled()
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024, seed: 0 })
    )

    studioRefs.pendingRecipe = {
      blueprintId: "bp1",
      blueprintName: "BP",
      category: "image",
      runtime: "comfy",
      prompt: "reuse me",
      values: {
        seed: 42,
        width: 768,
        height: 768,
        upscale: { modelId: "m", usdu: false },
        loras: [{ id: "missing", strength: 0.5 }],
      },
    }
    applyLoadedBlueprintDetail(detail())
    expect(setPrompt).toHaveBeenCalledWith("reuse me")
    expect(setUpscaleEnabled).toHaveBeenCalledWith(true)
    expect(setLoraStack).toHaveBeenCalledWith([
      { id: "missing", strength: 0.5 },
    ])

    const session: StudioSessionV1 = {
      v: 1,
      prompt: "s",
      aspectId: "16:9",
      sideLength: 1024,
      controlValues: { seed: 9 },
      loraStack: [],
      upscaleEnabled: false,
      upscaleModelId: "x",
      usduEnabled: false,
      usduScale: 2,
      usduSteps: 12,
      usduDenoise: 0.2,
      selectedGalleryId: null,
      followLive: true,
      toolsPath: null,
      imageToPrompt: {
        imagePath: null,
        previewUrl: null,
        format: "general",
        target: "auto",
        result: "",
        negative: null,
        fields: null,
        galleryOpen: false,
      },
      promptEnhance: {
        input: "",
        result: "",
        negative: null,
        target: "auto",
        mode: "expand",
        styleLook: "cinematic",
        seeded: false,
      },
    }
    studioRefs.pendingSession = session
    applyLoadedBlueprintDetail(detail({ id: "bp2" }))
    expect(setAspectId).toHaveBeenCalledWith("16:9")
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 9 })
    )

    state.detail = detail({ id: "bp3" })
    state.controlValues = { seed: 11, width: 512, height: 512 }
    applyLoadedBlueprintDetail(detail({ id: "bp3" }))
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 11 })
    )

    studioRefs.controlValuesByBlueprintId.bp4 = { seed: 77 }
    state.detail = detail({ id: "other" })
    applyLoadedBlueprintDetail(detail({ id: "bp4" }))
    expect(studioRefs.controlValuesByBlueprintId.other).toEqual(
      state.controlValues
    )
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ seed: 77 })
    )

    applyLoadedBlueprintDetail(
      detail({
        id: "nosize",
        controls: [
          {
            id: "seed",
            type: "number",
            nodeId: "1",
            input: "seed",
            default: 1,
          },
        ],
      })
    )
    expect(setControlValues).toHaveBeenCalledWith({ seed: 1 })

    // restoredControls + non-finite size → session aspect path (lines 68-74)
    studioRefs.pendingSession = {
      ...session,
      aspectId: "4:3",
      sideLength: 0,
      controlValues: {},
    }
    applyLoadedBlueprintDetail(
      detail({
        id: "size-session",
        controls: [
          { id: "width", type: "number", nodeId: "1", input: "width" },
          { id: "height", type: "number", nodeId: "1", input: "height" },
        ],
      })
    )
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({
        width: expect.any(Number),
        height: expect.any(Number),
      })
    )

    // restoredControls + non-finite size + no session → studioRefs path (75-79)
    studioRefs.controlValuesByBlueprintId["size-refs"] = {}
    studioRefs.aspectId = "1:1"
    studioRefs.sideLength = 0
    state.detail = detail({ id: "other2" })
    applyLoadedBlueprintDetail(
      detail({
        id: "size-refs",
        controls: [
          { id: "width", type: "number", nodeId: "1", input: "width" },
          { id: "height", type: "number", nodeId: "1", input: "height" },
        ],
      })
    )
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 })
    )

    // !restoredControls path uses studioRefs.sideLength || SIDE_LENGTH_DEFAULT (L83)
    studioRefs.pendingRecipe = null
    studioRefs.pendingSession = null
    studioRefs.controlValuesByBlueprintId = {}
    studioRefs.aspectId = "1:1"
    studioRefs.sideLength = 0
    state.detail = null
    applyLoadedBlueprintDetail(
      detail({
        id: "fresh-size",
        controls: [
          { id: "width", type: "number", nodeId: "1", input: "width" },
          { id: "height", type: "number", nodeId: "1", input: "height" },
        ],
      })
    )
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 1024 })
    )
  })

  it("merges pack defaults for steps/cfg and honors forceBlueprintDefaults", () => {
    const withSampling = detail({
      id: "krea",
      defaults: { steps: 8, cfg: 1, clipType: "krea2" },
      controls: [
        {
          id: "steps",
          type: "number",
          nodeId: "1",
          input: "steps",
          default: 8,
        },
        { id: "cfg", type: "number", nodeId: "1", input: "cfg", default: 1 },
        { id: "seed", type: "number", nodeId: "1", input: "seed", default: 0 },
      ],
    })
    expect(defaultsFromBlueprintDetail(withSampling)).toEqual({
      steps: 8,
      cfg: 1,
      seed: 0,
    })

    studioRefs.controlValuesByBlueprintId.krea = { steps: 40, cfg: 7, seed: 9 }
    state.detail = detail({ id: "other" })
    state.controlValues = { seed: 1 }
    studioRefs.forceBlueprintDefaults = true
    applyLoadedBlueprintDetail(withSampling)
    expect(studioRefs.forceBlueprintDefaults).toBe(false)
    expect(setControlValues).toHaveBeenCalledWith(
      expect.objectContaining({ steps: 8, cfg: 1, seed: 0 })
    )
  })
})
