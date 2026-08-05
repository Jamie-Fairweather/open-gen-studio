import { describe, expect, it } from "vitest"
import type { StudioStore } from "../studio-store-types"
import {
  selectActiveJobKey,
  selectComfy,
  selectInstallingId,
  selectInstallQueue,
  selectLoraInstallingKey,
  selectLoraQueuedKeys,
  selectUpscaleInstallingId,
  selectUpscalePendingIds,
  selectUpscaleQueuedIds,
} from "./select-install"

function s(partial: Partial<StudioStore>): StudioStore {
  return {
    runtimes: [],
    downloadSnapshot: { active: null, queued: [], history: [] },
    pendingUpscaleIds: [],
    ...partial,
  } as StudioStore
}

describe("select-install", () => {
  it("reads comfy runtime and download job keys", () => {
    expect(
      selectComfy(s({ runtimes: [{ engine: "comfyui" } as never] }))
    ).toEqual({ engine: "comfyui" })
    expect(selectActiveJobKey(s({}))).toBeNull()
    expect(selectInstallingId(s({}))).toBeNull()
    expect(selectLoraInstallingKey(s({}))).toBeNull()
    expect(selectUpscaleInstallingId(s({}))).toBeNull()
    expect(
      selectInstallingId(
        s({
          downloadSnapshot: {
            active: { jobKey: "blueprint:bp1" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBe("bp1")
    expect(
      selectInstallingId(
        s({
          downloadSnapshot: {
            active: { jobKey: "other" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBe("other")
    expect(
      selectInstallQueue(
        s({
          downloadSnapshot: {
            active: null,
            queued: [
              { jobKey: "blueprint:a" } as never,
              { jobKey: "raw" } as never,
            ],
            history: [],
          },
        })
      )
    ).toEqual(["a", "raw"])
    expect(
      selectLoraInstallingKey(
        s({
          downloadSnapshot: {
            active: { jobKey: "lora:pack1" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBe("pack1")
    expect(
      selectLoraInstallingKey(
        s({
          downloadSnapshot: {
            active: { jobKey: "blueprint:bp1" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBeNull()
    expect(
      selectUpscaleInstallingId(
        s({
          downloadSnapshot: {
            active: { jobKey: "lora:pack1" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBeNull()
    expect(
      selectLoraQueuedKeys(
        s({
          downloadSnapshot: {
            active: null,
            queued: [
              { jobKey: "lora:x" } as never,
              { jobKey: "blueprint:y" } as never,
            ],
            history: [],
          },
        })
      )
    ).toEqual(["x"])
    expect(
      selectUpscaleInstallingId(
        s({
          downloadSnapshot: {
            active: { jobKey: "upscale:m1" } as never,
            queued: [],
            history: [],
          },
        })
      )
    ).toBe("m1")
    expect(
      selectUpscaleQueuedIds(
        s({
          downloadSnapshot: {
            active: null,
            queued: [
              { jobKey: "upscale:u1" } as never,
              { jobKey: "lora:z" } as never,
            ],
            history: [],
          },
        })
      )
    ).toEqual(["u1"])
    expect(selectUpscalePendingIds(s({ pendingUpscaleIds: ["p"] }))).toEqual([
      "p",
    ])
  })
})
