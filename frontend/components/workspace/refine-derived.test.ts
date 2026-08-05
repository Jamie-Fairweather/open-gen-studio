import { describe, expect, it } from "vitest"
import type { UpscaleModelInfo } from "@/lib/host"
import { deriveRefineState } from "./refine-derived"

const models: UpscaleModelInfo[] = [
  {
    id: "sr4",
    name: "SR",
    description: "",
    filename: "a.pth",
    url: "",
    scale: 4,
    kind: "sr",
    ready: true,
  },
  {
    id: "supir1",
    name: "SUPIR",
    description: "",
    filename: "b.pth",
    url: "",
    scale: 4,
    kind: "supir",
    ready: true,
  },
]

describe("deriveRefineState", () => {
  it("derives scale, dims, arch flags, and install busy states", () => {
    const base = deriveRefineState({
      models,
      modelId: "sr4",
      usduEnabled: true,
      usduScale: 2,
      width: 512,
      height: 256,
      arch: "flux",
      installingId: null,
      queuedIds: [],
      pendingIds: [],
    })
    expect(base).toMatchObject({
      effectiveScale: 2,
      outW: 1024,
      outH: 512,
      turboArch: true,
      guiderUsdu: false,
      modelBusy: false,
      usduBusy: false,
    })

    const supir = deriveRefineState({
      models,
      modelId: "supir1",
      usduEnabled: false,
      usduScale: 4,
      arch: "flux2",
      installingId: "supir1",
      queuedIds: [],
      pendingIds: [],
    })
    expect(supir.isSupir).toBe(true)
    expect(supir.effectiveScale).toBe(2)
    expect(supir.guiderUsdu).toBe(true)
    expect(supir.modelInstalling).toBe(true)

    const queued = deriveRefineState({
      models,
      modelId: "sr4",
      usduEnabled: false,
      usduScale: 4,
      installingId: null,
      queuedIds: ["sr4", "usdu"],
      pendingIds: ["sr4", "usdu"],
    })
    expect(queued.modelQueued).toBe(true)
    expect(queued.usduQueued).toBe(true)

    const pending = deriveRefineState({
      models,
      modelId: "missing",
      usduEnabled: false,
      usduScale: 4,
      installingId: null,
      queuedIds: [],
      pendingIds: ["sr4", "usdu"],
    })
    expect(pending.selected?.id).toBe("sr4")
    expect(pending.modelInstalling).toBe(true)
    expect(pending.usduInstalling).toBe(true)
    expect(pending.outW).toBeNull()

    const ideogram = deriveRefineState({
      models,
      modelId: "sr4",
      usduEnabled: true,
      usduScale: 4,
      width: 512,
      height: 512,
      arch: "ideogram4",
      installingId: null,
      queuedIds: [],
      pendingIds: [],
    })
    expect(ideogram.turboArch).toBe(true)
    expect(ideogram.guiderUsdu).toBe(true)
    expect(ideogram.effectiveScale).toBe(4)

    const missing = deriveRefineState({
      models: [],
      modelId: "missing",
      usduEnabled: false,
      usduScale: 4,
      installingId: null,
      queuedIds: [],
      pendingIds: [],
    })
    expect(missing.selected).toBeUndefined()
    expect(missing.effectiveScale).toBe(4)
  })
})
