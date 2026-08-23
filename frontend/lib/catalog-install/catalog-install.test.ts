import { describe, expect, it, vi } from "vitest"
import { catalogGatePatch } from "./apply-gate"
import { collectGatedRepos } from "./gated-repos"
import {
  isCivitaiUrl,
  blueprintIdFromJobKey,
  isPromptToolsJobKey,
} from "./job-keys"
import { planCatalogInstall } from "./plan"
import {
  addPendingUpscaleId,
  dropPendingUpscaleId,
  installingBlueprintId,
  installingLoraKey,
  installingPromptToolsProvider,
  installingUpscaleId,
  liveUpscaleIds,
  nextPendingUpscaleIds,
  queuedBlueprintIds,
  queuedLoraKeys,
  queuedUpscaleIds,
} from "./snapshot"
import { downloadSpecFor, startCatalogInstall } from "./start"
import { uninstallToastDescription } from "./uninstall"
import type { CatalogInstallHost, CatalogRow } from "./types"

const tokens = { huggingface: false, civitai: false }

function host(overrides?: Partial<CatalogInstallHost>): CatalogInstallHost {
  return {
    ensureDownload: vi.fn(async () => ({
      status: "queued",
      jobId: "j1",
      message: null,
    })),
    installRuntime: vi.fn(async () => {}),
    ...overrides,
  }
}

describe("planCatalogInstall", () => {
  it("skips gates when tokens are already decided", async () => {
    const result = await planCatalogInstall({
      row: { kind: "blueprint", id: "bp1" },
      tokens,
      gatedTermsAcked: false,
      tokensAlreadyDecided: true,
      blueprint: { requiresHfToken: true, requiresCivitaiToken: true },
    })
    expect(result).toEqual({ action: "proceed" })
  })

  it("gates blueprint HF then Civitai then terms", async () => {
    const collect = vi.fn(async () => [
      { id: "org/model", pageUrl: "https://huggingface.co/org/model" },
    ])
    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "bp1" },
        tokens,
        gatedTermsAcked: false,
        blueprint: { requiresHfToken: true },
      })
    ).toEqual({ action: "gate", need: { type: "hf-token" } })

    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "bp1" },
        tokens: { huggingface: true, civitai: false },
        gatedTermsAcked: false,
        blueprint: { requiresCivitaiToken: true },
      })
    ).toEqual({ action: "gate", need: { type: "civitai-token" } })

    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "bp1" },
        tokens: { huggingface: true, civitai: true },
        gatedTermsAcked: false,
        blueprint: { requiresHfToken: true },
        collectGatedRepos: collect,
      })
    ).toEqual({
      action: "gate",
      need: {
        type: "gated-terms",
        repos: [
          { id: "org/model", pageUrl: "https://huggingface.co/org/model" },
        ],
      },
    })
    expect(collect).toHaveBeenCalledWith("bp1")

    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "bp1" },
        tokens: { huggingface: true, civitai: true },
        gatedTermsAcked: false,
        blueprint: { requiresHfToken: true },
      })
    ).toEqual({ action: "gate", need: { type: "gated-terms", repos: [] } })

    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "ok" },
        tokens: { huggingface: true, civitai: true },
        gatedTermsAcked: true,
        blueprint: { requiresHfToken: true },
      })
    ).toEqual({ action: "proceed" })

    expect(
      await planCatalogInstall({
        row: { kind: "blueprint", id: "plain" },
        tokens,
        gatedTermsAcked: false,
      })
    ).toEqual({ action: "proceed" })
  })

  it("gates LoRA Civitai URLs only", async () => {
    expect(
      await planCatalogInstall({
        row: { kind: "lora", id: "l1", arch: "flux" },
        tokens,
        gatedTermsAcked: true,
        loraUrl: "https://civitai.com/x",
      })
    ).toEqual({ action: "gate", need: { type: "civitai-token" } })

    expect(
      await planCatalogInstall({
        row: { kind: "lora", id: "l1", arch: "flux" },
        tokens: { huggingface: false, civitai: true },
        gatedTermsAcked: true,
        loraUrl: "https://civitai.red/x",
      })
    ).toEqual({ action: "proceed" })

    expect(
      await planCatalogInstall({
        row: { kind: "lora", id: "l1", arch: "flux" },
        tokens,
        gatedTermsAcked: true,
        loraUrl: "https://hf.co/y",
      })
    ).toEqual({ action: "proceed" })
  })

  it("proceeds for upscaler, Prompt Tools, and Runtime", async () => {
    for (const row of [
      { kind: "upscale", id: "u1" },
      { kind: "promptTools", provider: "qwenvl" },
      { kind: "runtime", engine: "comfyui" },
    ] satisfies CatalogRow[]) {
      expect(
        await planCatalogInstall({
          row,
          tokens,
          gatedTermsAcked: false,
        })
      ).toEqual({ action: "proceed" })
    }
  })
})

describe("startCatalogInstall", () => {
  it("maps each Catalog row to Downloads or Runtime", async () => {
    const h = host()
    await startCatalogInstall({ kind: "blueprint", id: "bp1" }, h)
    expect(h.ensureDownload).toHaveBeenCalledWith(
      { kind: "blueprint", id: "bp1" },
      { wait: false }
    )

    await startCatalogInstall({ kind: "lora", id: "l1", arch: "flux" }, h)
    expect(h.ensureDownload).toHaveBeenCalledWith(
      { kind: "lora", id: "l1", arch: "flux" },
      { wait: false }
    )

    await startCatalogInstall({ kind: "upscale", id: "u1" }, h)
    await startCatalogInstall({ kind: "promptTools", provider: "qwenvl" }, h)

    const runtime = await startCatalogInstall(
      { kind: "runtime", engine: "comfyui" },
      h
    )
    expect(h.installRuntime).toHaveBeenCalled()
    expect(runtime.status).toBe("runtime")

    expect(downloadSpecFor({ kind: "blueprint", id: "x" })).toEqual({
      kind: "blueprint",
      id: "x",
    })
    expect(downloadSpecFor({ kind: "upscale", id: "u1" })).toEqual({
      kind: "upscale",
      id: "u1",
    })
    expect(
      downloadSpecFor({ kind: "promptTools", provider: "qwenvl" })
    ).toEqual({ kind: "promptTools", provider: "qwenvl" })
  })
})

describe("collectGatedRepos", () => {
  it("dedupes HF repos and swallows load errors", async () => {
    expect(
      await collectGatedRepos("bp1", async () => ({
        models: [
          {
            gated: true,
            url: "https://huggingface.co/org/model/resolve/main/f.safetensors",
          },
          { gated: false, url: "https://example.com/x" },
          { gated: true, url: "" },
          {
            gated: true,
            url: "https://huggingface.co/org/model/resolve/main/g.safetensors",
          },
        ],
      }))
    ).toEqual([
      { id: "org/model", pageUrl: "https://huggingface.co/org/model" },
    ])

    expect(
      await collectGatedRepos("empty", async () => ({ models: null }))
    ).toEqual([])

    expect(
      await collectGatedRepos("boom", async () => {
        throw new Error("gb")
      })
    ).toEqual([])
  })
})

describe("catalogGatePatch", () => {
  it("opens the matching dialog and records the pending row", () => {
    expect(
      catalogGatePatch({ type: "hf-token" }, { kind: "blueprint", id: "bp1" })
    ).toEqual({ pendingInstallId: "bp1", hfTokenDialogOpen: true })
    expect(
      catalogGatePatch(
        { type: "civitai-token" },
        { kind: "lora", id: "l1", arch: "flux" }
      )
    ).toEqual({
      pendingLoraInstall: { id: "l1", arch: "flux" },
      civitaiTokenDialogOpen: true,
    })
    expect(
      catalogGatePatch(
        { type: "gated-terms", repos: [] },
        { kind: "upscale", id: "u1" }
      )
    ).toEqual({ gatedModelRepos: [], gatedModelDialogOpen: true })
  })
})

describe("snapshot + uninstall helpers", () => {
  it("derives installing ids and pending upscale", () => {
    const snapshot = {
      active: { jobKey: "blueprint:bp1" },
      queued: [
        { jobKey: "blueprint:a" },
        { jobKey: "lora:x" },
        { jobKey: "upscale:u1" },
        { jobKey: "prompt-tools:qwenvl" },
        { jobKey: "raw" },
      ],
    }
    expect(installingBlueprintId(snapshot)).toBe("bp1")
    expect(installingBlueprintId({ active: null, queued: [] })).toBeNull()
    expect(queuedBlueprintIds(snapshot)).toEqual([
      "a",
      "lora:x",
      "upscale:u1",
      "prompt-tools:qwenvl",
      "raw",
    ])
    expect(
      installingLoraKey({ active: { jobKey: "lora:pack1" }, queued: [] })
    ).toBe("pack1")
    expect(installingLoraKey(snapshot)).toBeNull()
    expect(queuedLoraKeys(snapshot)).toEqual(["x"])
    expect(
      installingUpscaleId({ active: { jobKey: "upscale:m1" }, queued: [] })
    ).toBe("m1")
    expect(queuedUpscaleIds(snapshot)).toEqual(["u1"])
    expect(
      installingPromptToolsProvider({
        active: { jobKey: "prompt-tools:qwenvl" },
        queued: [],
      })
    ).toBe("qwenvl")
    expect(installingPromptToolsProvider(snapshot)).toBeNull()

    const up = {
      active: { jobKey: "upscale:m1" },
      queued: [{ jobKey: "upscale:m2" }, { jobKey: "other:x" }],
    }
    expect([...liveUpscaleIds({ active: {}, queued: [{}] })]).toEqual([])
    expect(queuedLoraKeys({ active: null, queued: [{}] })).toEqual([])
    expect(queuedUpscaleIds({ active: null, queued: [{}] })).toEqual([])
    expect(queuedBlueprintIds({ active: null, queued: [{}] })).toEqual([""])
    expect([...liveUpscaleIds(up)].toSorted()).toEqual(["m1", "m2"])
    expect(nextPendingUpscaleIds(["m1", "m2", "other"], up)).toEqual(["other"])
    expect(addPendingUpscaleId(["u1"], "u1")).toEqual(["u1"])
    expect(addPendingUpscaleId([], "u2")).toEqual(["u2"])
    expect(dropPendingUpscaleId(["u2", "u3"], "u2")).toEqual(["u3"])

    expect(uninstallToastDescription({ removed: 2, kept: 1 })).toBe(
      "Removed 2 file(s); kept 1 shared"
    )
    expect(uninstallToastDescription({ removed: 3, kept: 0 })).toBe(
      "Removed 3 file(s)"
    )
    expect(isCivitaiUrl("https://Civitai.com/x")).toBe(true)
    expect(blueprintIdFromJobKey("blueprint:z")).toBe("z")
    expect(isPromptToolsJobKey("prompt-tools:x")).toBe(true)
  })
})
