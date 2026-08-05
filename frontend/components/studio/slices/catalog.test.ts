import { beforeEach, describe, expect, it, vi } from "vitest"
import { studioRefs } from "../studio-refs"

const host = vi.hoisted(() => ({
  setSetting: vi.fn(async () => {}),
  listBlueprints: vi.fn(async () => [{ id: "bp1" }]),
  listLoras: vi.fn(async () => []),
  deleteUserLora: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

import { notifyError } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => {
  vi.clearAllMocks()
  studioRefs.preferredBlueprintId = null
  studioRefs.forceBlueprintDefaults = false
  studioRefs.controlValuesByBlueprintId = {}
  studioRefs.pushPath = vi.fn()
})

describe("createCatalogSlice", () => {
  it("selects, refreshes, setters, and openCreatorEdit", async () => {
    const store = createTestStudioStore()
    const s = store.getState()

    studioRefs.controlValuesByBlueprintId.bp1 = { steps: 40 }
    s.selectBlueprint("bp1")
    expect(store.getState().selectedId).toBe("bp1")
    expect(store.getState().detailReloadToken).toBe(1)
    expect(studioRefs.preferredBlueprintId).toBe("bp1")
    expect(studioRefs.forceBlueprintDefaults).toBe(true)
    expect(studioRefs.controlValuesByBlueprintId.bp1).toBeUndefined()
    expect(host.setSetting).toHaveBeenCalled()
    host.setSetting.mockRejectedValueOnce(new Error("x"))
    s.selectBlueprint("bp2")
    expect(store.getState().detailReloadToken).toBe(2)

    await s.refreshBlueprints()
    expect(store.getState().blueprints).toEqual([{ id: "bp1" }])
    host.listBlueprints.mockRejectedValueOnce(new Error("boom"))
    s.refreshBlueprints()
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith("boom"))
    host.listBlueprints.mockRejectedValueOnce("plain")
    s.refreshBlueprints()
    await vi.waitFor(() => expect(notifyError).toHaveBeenCalledWith("plain"))

    s.setBlueprints([{ id: "a" } as never])
    s.setSelectedId("x")
    s.setLoraPacks([{ id: "l1" } as never])
    expect(studioRefs.loraPacks).toEqual([{ id: "l1" }])
    s.setDetail({ id: "d" } as never)
    s.setBlueprintsLoaded(true)
    s.setUpscaleModels([{ id: "u" } as never])
    s.setUsduReady(true)
    s.setSizesProbing(true)
    expect(store.getState()).toMatchObject({
      selectedId: "x",
      blueprintsLoaded: true,
      usduReady: true,
      sizesProbing: true,
    })

    s.openCreatorEdit("edit1")
    expect(store.getState().editBlueprintId).toBe("edit1")
    expect(studioRefs.pushPath).toHaveBeenCalledWith("/creator?edit=edit1")

    expect(s.listLoras).toBe(host.listLoras)
    expect(s.deleteUserLora).toBe(host.deleteUserLora)
    expect(typeof s.isInstalled).toBe("function")
  })
})
