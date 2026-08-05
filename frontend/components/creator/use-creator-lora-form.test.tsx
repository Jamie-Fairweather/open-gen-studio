/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const host = vi.hoisted(() => ({
  getLora: vi.fn(),
  expandCivitaiLoraUrl: vi.fn(),
  resolveModelUrl: vi.fn(async (url: string) => ({
    filename: "f.safetensors",
    downloadUrl: url,
  })),
  saveUserLora: vi.fn(async (p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
    source: "user",
    arches: ["z-image"],
    variants: [],
    variantCount: 0,
    variantsReady: 0,
    thumbnailPath: null,
    defaultStrength: 1,
  })),
  setUserLoraThumbnail: vi.fn(async () => "/lt.png"),
}))
const notify = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

vi.mock("@/lib/host", () => host)
vi.mock("@/lib/notify", () => notify)

import { useCreatorLoraForm } from "./use-creator-lora-form"

describe("useCreatorLoraForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    host.getLora.mockResolvedValue({
      id: "lora1",
      name: "Pack",
      variants: [{ arch: "z-image", url: "https://x/a.safetensors" }],
      thumbnailPath: "/t.png",
    })
    host.expandCivitaiLoraUrl.mockResolvedValue({
      name: "Expanded",
      variants: [{ arch: "z-image", url: "https://civitai.com/dl/1" }],
      skippedBaseModels: ["SD1.5"],
    })
  })

  it("loads, expands civitai, updates, saves with thumb", async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() =>
      useCreatorLoraForm({
        editLoraId: "lora1",
        onSaved,
        onEditCleared: vi.fn(),
      })
    )
    await waitFor(() => expect(result.current.loadingEdit).toBe(false))
    expect(result.current.name).toBe("Pack")

    act(() => {
      result.current.setName("")
      result.current.updateVariant(result.current.variants[0].key, {
        url: "https://civitai.com/models/1",
      })
    })
    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/1")
    })
    expect(notify.notifySuccess).toHaveBeenCalled()
    expect(result.current.name).toBe("Expanded")

    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/1")
    })

    host.expandCivitaiLoraUrl.mockRejectedValueOnce(new Error("expand fail"))
    await act(async () => {
      await result.current.tryExpandFromUrl(
        "https://civitai.com/models/99?modelVersionId=1"
      )
    })
    expect(notify.notifyError).toHaveBeenCalled()

    host.expandCivitaiLoraUrl.mockRejectedValueOnce("expand str")
    await act(async () => {
      await result.current.tryExpandFromUrl(
        "https://civitai.com/models/88?modelVersionId=2"
      )
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "expand str",
      "CivitAI expand"
    )

    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    act(() => {
      result.current.setName("Saved")
      result.current.setIdTouched(true)
      result.current.setIdManual("saved")
      result.current.setVariants([
        {
          key: "k1",
          arch: "z-image",
          url: "https://x/a.safetensors",
        },
      ])
      result.current.setPendingThumb({
        bytes: [1],
        ext: "png",
        previewUrl: "blob:p",
      })
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(onSaved).toHaveBeenCalled()
    revoke.mockRestore()
  })

  it("validates and handles load/save errors", async () => {
    const onSaved = vi.fn()
    const cleared = vi.fn()
    host.getLora.mockRejectedValueOnce(new Error("load"))
    renderHook(() =>
      useCreatorLoraForm({
        editLoraId: "x",
        onSaved,
        onEditCleared: cleared,
      })
    )
    await waitFor(() => expect(cleared).toHaveBeenCalled())

    const { result } = renderHook(() => useCreatorLoraForm({ onSaved }))
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "Name is required",
      "Save LoRA"
    )

    act(() => {
      result.current.setName("N")
      result.current.setIdTouched(true)
      result.current.setIdManual("n")
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "Add at least one architecture URL",
      "Save LoRA"
    )

    act(() => {
      result.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/a.safetensors" },
        { key: "b", arch: "z-image", url: "https://x/b.safetensors" },
      ])
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "Each architecture can only appear once",
      "Save LoRA"
    )

    act(() => {
      result.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/a.safetensors" },
      ])
    })
    host.saveUserLora.mockRejectedValueOnce(new Error("save"))
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith("save", "Save LoRA")

    host.getLora.mockResolvedValueOnce({
      id: "empty",
      name: "E",
      variants: [],
      thumbnailPath: null,
    })
    const { result: r2 } = renderHook(() =>
      useCreatorLoraForm({ editLoraId: "empty", onSaved })
    )
    await waitFor(() => expect(r2.current.loadingEdit).toBe(false))
    expect(r2.current.variants).toHaveLength(1)
  })

  it("covers cancel, expand edge cases, and resolve fallback", async () => {
    const onSaved = vi.fn()
    host.expandCivitaiLoraUrl.mockResolvedValueOnce({
      name: "One",
      variants: [{ arch: "z-image", url: "https://civitai.com/dl/1" }],
      skippedBaseModels: [],
    })
    const { result, unmount } = renderHook(() =>
      useCreatorLoraForm({ onSaved })
    )
    act(() => {
      result.current.setName("Keep")
      result.current.updateVariant(result.current.variants[0].key, {
        url: "https://civitai.com/models/1",
      })
    })
    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/1")
    })
    expect(result.current.name).toBe("Keep")
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      "Filled 1 arch",
      "z-image"
    )

    host.expandCivitaiLoraUrl.mockRejectedValueOnce(new Error("nope"))
    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/download/1")
    })
    expect(notify.notifyError).not.toHaveBeenCalledWith(
      expect.anything(),
      "CivitAI expand"
    )

    host.getLora.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: "slow",
                name: "Slow",
                variants: [],
                thumbnailPath: null,
              }),
            50
          )
        })
    )
    const { unmount: u2 } = renderHook(() =>
      useCreatorLoraForm({ editLoraId: "slow", onSaved })
    )
    u2()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    host.expandCivitaiLoraUrl.mockResolvedValueOnce({
      name: "Skip",
      variants: [{ arch: "z-image", url: "https://civitai.com/dl/1" }],
      skippedBaseModels: ["SD1.5"],
    })
    act(() => {
      result.current.updateVariant(result.current.variants[0].key, {
        url: "https://civitai.com/models/9",
      })
    })
    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/9")
    })
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      "Filled 1 arch",
      expect.stringContaining("skipped SD1.5")
    )

    host.getLora.mockResolvedValueOnce({
      id: "thumb",
      name: "T",
      variants: [{ arch: "z-image", url: "https://x/a.safetensors" }],
      thumbnailPath: null,
    })
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const { result: r3 } = renderHook(() =>
      useCreatorLoraForm({ editLoraId: "thumb", onSaved })
    )
    act(() => {
      r3.current.setPendingThumb({
        bytes: [1],
        ext: "png",
        previewUrl: "blob:pending",
      })
    })
    await waitFor(() => expect(r3.current.loadingEdit).toBe(false))
    expect(revoke).toHaveBeenCalled()
    revoke.mockRestore()

    host.getLora.mockRejectedValueOnce("load string")
    renderHook(() =>
      useCreatorLoraForm({
        editLoraId: "bad",
        onSaved,
        onEditCleared: vi.fn(),
      })
    )
    await waitFor(() =>
      expect(notify.notifyError).toHaveBeenCalledWith(
        "load string",
        "Load LoRA"
      )
    )

    host.resolveModelUrl.mockResolvedValueOnce({
      filename: "",
      downloadUrl: "https://x/a.safetensors",
    })
    act(() => {
      result.current.setName("Fallback")
      result.current.setIdTouched(true)
      result.current.setIdManual("fallback")
      result.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/a.safetensors" },
      ])
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(onSaved).toHaveBeenCalled()
    unmount()
  })

  it("ignores expand no-ops and reports plural arch fill", async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() => useCreatorLoraForm({ onSaved }))

    await act(async () => {
      await result.current.tryExpandFromUrl("")
      await result.current.tryExpandFromUrl(
        "https://example.com/file.safetensors"
      )
    })

    host.expandCivitaiLoraUrl.mockResolvedValueOnce({
      name: "Multi",
      variants: [
        { arch: "z-image", url: "https://civitai.com/dl/1" },
        { arch: "flux", url: "https://civitai.com/dl/2" },
      ],
      skippedBaseModels: [],
    })
    act(() => {
      result.current.updateVariant(result.current.variants[0].key, {
        url: "https://civitai.com/models/multi",
      })
    })
    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/multi")
    })
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      "Filled 2 arches",
      "z-image, flux"
    )

    await act(async () => {
      await result.current.tryExpandFromUrl("https://civitai.com/models/multi")
    })

    host.saveUserLora.mockRejectedValueOnce("save str")
    act(() => {
      result.current.setName("S")
      result.current.setIdTouched(true)
      result.current.setIdManual("s")
      result.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/a.safetensors" },
      ])
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith("save str", "Save LoRA")
  })

  it("covers null variant url, cancelled load error, and resolve url fallback", async () => {
    const onSaved = vi.fn()
    host.getLora.mockResolvedValueOnce({
      id: "nullurl",
      name: "NullUrl",
      variants: [{ arch: "z-image", url: null as unknown as string }],
      thumbnailPath: null,
    })
    const { result } = renderHook(() =>
      useCreatorLoraForm({ editLoraId: "nullurl", onSaved })
    )
    await waitFor(() => expect(result.current.loadingEdit).toBe(false))
    expect(result.current.variants[0]?.url).toBe("")

    host.getLora.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("late")), 50)
        })
    )
    const { unmount } = renderHook(() =>
      useCreatorLoraForm({
        editLoraId: "late",
        onSaved,
        onEditCleared: vi.fn(),
      })
    )
    unmount()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    const { result: r2 } = renderHook(() => useCreatorLoraForm({ onSaved }))
    act(() => {
      r2.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/a.safetensors" },
        { key: "b", arch: "flux", url: "https://x/b.safetensors" },
      ])
      r2.current.updateVariant("a", { url: "https://x/updated.safetensors" })
      r2.current.updateVariant("missing", { url: "nope" })
    })
    expect(r2.current.variants[0]?.url).toBe("https://x/updated.safetensors")
    expect(r2.current.variants[1]?.url).toBe("https://x/b.safetensors")

    host.resolveModelUrl.mockResolvedValueOnce({
      filename: "",
      downloadUrl: "",
    })
    act(() => {
      r2.current.setVariants([
        { key: "a", arch: "z-image", url: "https://x/updated.safetensors" },
      ])
      r2.current.setName("Direct")
      r2.current.setIdTouched(true)
      r2.current.setIdManual("direct")
    })
    await act(async () => {
      await r2.current.handleSave()
    })
    expect(host.saveUserLora).toHaveBeenCalledWith(
      expect.objectContaining({
        variants: [
          expect.objectContaining({
            url: "https://x/updated.safetensors",
          }),
        ],
      })
    )
  })
})
