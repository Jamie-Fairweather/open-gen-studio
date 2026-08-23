import { beforeEach, describe, expect, it, vi } from "vitest"
import { blueprintSession } from "@/lib/blueprint-session/state"
import { studioRefs } from "../studio-refs"

const host = vi.hoisted(() => ({
  parseGalleryRecipe: vi.fn(() => null as unknown),
  deleteGalleryItem: vi.fn(async () => {}),
  revealGalleryItem: vi.fn(async () => {}),
  copyGalleryImageToClipboard: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

vi.mock("./session-persist", () => ({
  flushPersistImageSession: vi.fn(),
  schedulePersistImageSession: vi.fn(),
}))

import { notifyError, notifyInfo, notifySuccess } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

const item = (id: string) =>
  ({
    id,
    path: `${id}.png`,
    jobId: null,
    thumbnailPath: null,
    metadataJson: "{}",
    createdAt: 0,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  blueprintSession.pendingRecipe = null
  studioRefs.livePreviewSrc = "x"
  studioRefs.pendingPreviewSrc = "y"
})

describe("createGallerySlice", () => {
  it("ingest/patch/delete/reveal/copy/reuse cover branches", async () => {
    const store = createTestStudioStore()
    const s = store.getState()

    s.setGallery([item("g1")])
    s.setGalleryLoaded(true)
    s.setSelectedGalleryId("g1")
    s.selectGalleryItem("g1")
    expect(store.getState().followLive).toBe(false)

    store.setState({ followLive: true, gallery: [] })
    s.ingestGalleryItem(item("g2"))
    expect(store.getState().selectedGalleryId).toBe("g2")
    s.ingestGalleryItem(item("g2"))
    store.setState({ followLive: false })
    s.ingestGalleryItem(item("g3"))

    s.patchGalleryItem(item("g2"))
    s.patchGalleryItem(item("g4"))

    await s.handleDeleteGalleryItem("g2")
    expect(notifySuccess).toHaveBeenCalled()
    store.setState({ selectedGalleryId: "g1" })
    await s.handleDeleteGalleryItem("g2")
    expect(store.getState().selectedGalleryId).toBe("g1")

    host.deleteGalleryItem.mockRejectedValueOnce(new Error("del"))
    store.setState({
      gallery: [item("g5")],
      selectedGalleryId: "g5",
    })
    await expect(s.handleDeleteGalleryItem("g5")).rejects.toThrow("del")
    expect(store.getState().gallery).toHaveLength(1)
    host.deleteGalleryItem.mockRejectedValueOnce("plain-del")
    store.setState({
      gallery: [item("g6"), item("g7")],
      selectedGalleryId: "g6",
    })
    await expect(s.handleDeleteGalleryItem("g7")).rejects.toBe("plain-del")

    store.setState({ followLive: true, selectedGalleryId: "g5" })
    await s.handleRevealGalleryItem()
    expect(host.revealGalleryItem).toHaveBeenCalledWith(null)
    store.setState({ followLive: false, selectedGalleryId: "g5" })
    host.revealGalleryItem.mockRejectedValueOnce(new Error("reveal"))
    await s.handleRevealGalleryItem()
    host.revealGalleryItem.mockRejectedValueOnce("r")
    await s.handleRevealGalleryItem()
    expect(notifyError).toHaveBeenCalled()

    await s.handleCopyGalleryImage("g5")
    host.copyGalleryImageToClipboard.mockRejectedValueOnce(new Error("c"))
    await s.handleCopyGalleryImage("g5")
    host.copyGalleryImageToClipboard.mockRejectedValueOnce("plain-copy")
    await s.handleCopyGalleryImage("g5")

    s.handleReuseGalleryPrompt(item("g5"))
    expect(notifyInfo).toHaveBeenCalled()
    host.parseGalleryRecipe.mockReturnValueOnce({ prompt: "hello" })
    s.handleReuseGalleryPrompt(item("g5"))
    expect(store.getState().prompt).toBe("hello")

    s.handleReuseGallerySettings(item("g5"))
    expect(notifyInfo).toHaveBeenCalled()

    host.parseGalleryRecipe.mockReturnValueOnce({
      category: "image",
      blueprintId: "bp1",
      blueprintName: "BP",
      values: { width: 512, height: 512, seed: 1 },
    })
    store.setState({
      blueprints: [
        {
          id: "bp1",
          category: "image",
          modelsReady: 1,
          modelCount: 1,
        } as never,
      ],
      selectedId: "bp1",
      detail: {
        id: "bp1",
        arch: "flux",
        controls: [{ id: "seed" }],
      } as never,
      loraPacks: [],
    })
    store.getState().handleReuseGallerySettings(item("g5"))
    expect(notifySuccess).toHaveBeenCalled()

    host.parseGalleryRecipe.mockReturnValueOnce({
      prompt: "p",
      category: "image",
      values: { width: 512, height: 512 },
    })
    store.setState({
      detail: {
        id: "bp1",
        controls: [],
      } as never,
    })
    store.getState().handleReuseGallerySettings(item("g5"))

    host.parseGalleryRecipe.mockReturnValueOnce({
      prompt: "p",
      category: "image",
      blueprintId: "bp1",
      blueprintName: "BP",
      values: { width: 512, height: 512, seed: 1 },
    })
    store.setState({
      blueprints: [
        {
          id: "bp1",
          category: "image",
          modelsReady: 1,
          modelCount: 1,
        } as never,
      ],
      selectedId: "bp1",
      detail: {
        id: "bp1",
        arch: "flux",
        controls: [{ id: "seed", default: 0 }],
      } as never,
      loraPacks: [],
    })
    store.getState().handleReuseGallerySettings(item("g5"))
    expect(notifySuccess).toHaveBeenCalled()

    host.parseGalleryRecipe.mockReturnValueOnce({
      category: "image",
      blueprintId: "other",
      values: {},
    })
    store.getState().handleReuseGallerySettings(item("g5"))
    expect(blueprintSession.pendingRecipe).toBeTruthy()

    host.parseGalleryRecipe.mockReturnValueOnce({
      category: "image",
      values: { width: "x", height: "y" },
    })
    store.getState().handleReuseGallerySettings(item("g5"))
  })
})
