/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const host = vi.hoisted(() => ({
  getBlueprint: vi.fn(),
  resolveModelUrl: vi.fn(async (url: string) => ({
    filename: "from-provider.safetensors",
    downloadUrl: url,
  })),
  saveUserBlueprint: vi.fn(async (_payload: Record<string, unknown>) => {}),
  setUserBlueprintThumbnail: vi.fn(async () => "/t.png"),
}))
const notify = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

vi.mock("@/lib/host", () => host)
vi.mock("@/lib/notify", () => notify)

import { useRecipeBlueprintForm } from "./use-recipe-blueprint-form"
import { ARCHES } from "@/lib/creator-arches"

describe("useRecipeBlueprintForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    host.getBlueprint.mockResolvedValue({
      id: "edit-bp",
      name: "Edited",
      description: "desc",
      arch: "flux",
      sampler: "  ",
      scheduler: "  ",
      capabilities: { negative: true },
      defaults: { steps: "bad", cfg: "x", guidance: "y" },
      models: [
        {
          role: "unet",
          path: "diffusion_models",
          filename: "u.safetensors",
          url: "https://x/u.safetensors",
        },
      ],
      thumbnailPath: "/old.png",
    })
  })

  it("loads edit blueprint, applyArch, resolve, save paths", async () => {
    const onSaved = vi.fn()
    const onEditCleared = vi.fn()
    const { result } = renderHook(() =>
      useRecipeBlueprintForm({
        onSaved,
        editBlueprintId: "edit-bp",
        onEditCleared,
      })
    )
    await waitFor(() => expect(result.current.loadingEdit).toBe(false))
    expect(result.current.name).toBe("Edited")
    expect(result.current.archId).toBe("flux")

    act(() => result.current.applyArch("z-image"))
    expect(result.current.archId).toBe("z-image")

    act(() => {
      result.current.setName("My Pack")
      result.current.setIdTouched(true)
      result.current.setIdManual("my-pack")
      result.current.setDescription("notes")
      result.current.updateModelUrl(0, "https://civitai.com/models/1")
    })
    await act(async () => {
      await result.current.resolveModelRow(0, "https://civitai.com/models/1")
    })
    expect(result.current.models[0].filename).toBe("from-provider.safetensors")

    host.resolveModelUrl.mockRejectedValueOnce(new Error("resolve fail"))
    await act(async () => {
      await result.current.resolveModelRow(0, "https://civitai.com/models/1")
    })
    expect(notify.notifyError).toHaveBeenCalled()

    act(() => {
      for (let i = 0; i < result.current.models.length; i++) {
        const slot = result.current.arch.slots[i]
        if (!slot) continue
        result.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://files.example/${slot.role}.safetensors`
        )
      }
    })

    const thumb = {
      bytes: [1],
      ext: "png",
      previewUrl: "blob:x",
    }
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    act(() => result.current.setPendingThumb(thumb))

    await act(async () => {
      await result.current.handleSave()
    })
    expect(host.saveUserBlueprint).toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith("my-pack")
    revoke.mockRestore()
  })

  it("validates save and handles load/save errors", async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() => useRecipeBlueprintForm({ onSaved }))

    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith("Name and id are required")

    act(() => {
      result.current.setName("N")
      result.current.setIdTouched(true)
      result.current.setIdManual("n")
      result.current.updateModelUrl(0, "")
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalled()

    act(() => {
      result.current.applyArch("z-image")
      result.current.setName("N")
      result.current.setIdManual("n")
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        const slot = result.current.arch.slots[i]
        result.current.updateModelUrl(
          i,
          `https://files.example/${slot.role}.safetensors`
        )
      }
    })
    host.saveUserBlueprint.mockRejectedValueOnce(new Error("save fail"))
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith("save fail", "Save failed")

    host.getBlueprint.mockRejectedValueOnce(new Error("load fail"))
    const cleared = vi.fn()
    renderHook(() =>
      useRecipeBlueprintForm({
        onSaved,
        editBlueprintId: "missing",
        onEditCleared: cleared,
      })
    )
    await waitFor(() => expect(cleared).toHaveBeenCalled())

    // provider resolve during save with bad filename
    const { result: r2 } = renderHook(() => useRecipeBlueprintForm({ onSaved }))
    act(() => {
      r2.current.setName("X")
      r2.current.setIdTouched(true)
      r2.current.setIdManual("x")
      r2.current.updateModelUrl(0, "https://civitai.com/models/9")
      // clear filename so save must resolve
      for (let i = 1; i < r2.current.models.length; i++) {
        const slot = r2.current.arch.slots[i]
        r2.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://f/${slot.role}.safetensors`
        )
      }
    })
    host.resolveModelUrl.mockResolvedValueOnce({
      filename: "",
      downloadUrl: "https://civitai.com/models/9",
    })
    await act(async () => {
      await r2.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalled()

    // guidance arch defaults branch
    const guidanceArch = ARCHES.find((a) => a.usesGuidance)
    if (guidanceArch) {
      act(() => r2.current.applyArch(guidanceArch.id))
      act(() => {
        r2.current.setName("G")
        r2.current.setIdManual("g")
        for (let i = 0; i < r2.current.arch.slots.length; i++) {
          const slot = r2.current.arch.slots[i]
          r2.current.updateModelUrl(
            i,
            slot.defaultUrl ?? `https://f/${slot.role}.safetensors`
          )
        }
      })
      host.saveUserBlueprint.mockResolvedValueOnce(undefined)
      await act(async () => {
        await r2.current.handleSave()
      })
      const payload = host.saveUserBlueprint.mock.calls.at(-1)?.[0] as
        { defaults: Record<string, unknown> } | undefined
      expect(payload?.defaults.guidance).toBeDefined()
    }

    // resolve during save when filename lacks a dot
    const { result: r3 } = renderHook(() => useRecipeBlueprintForm({ onSaved }))
    act(() => {
      r3.current.applyArch("z-image")
      r3.current.setName("R")
      r3.current.setIdTouched(true)
      r3.current.setIdManual("r-resolve")
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        const slot = r3.current.arch.slots[i]
        r3.current.updateModelUrl(i, `https://civitai.com/models/${i + 1}`)
      }
    })
    host.resolveModelUrl.mockResolvedValue({
      filename: "ok.safetensors",
      downloadUrl: "https://civitai.com/models/1",
    })
    host.saveUserBlueprint.mockResolvedValueOnce(undefined)
    await act(async () => {
      await r3.current.handleSave()
    })
    expect(host.resolveModelUrl).toHaveBeenCalled()

    host.resolveModelUrl.mockRejectedValueOnce(new Error("resolve save fail"))
    await act(async () => {
      await r3.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "resolve save fail",
      "Could not resolve model URL"
    )

    // required filename with slash (from resolve)
    act(() => {
      r3.current.applyArch("z-image")
      r3.current.setName("Slash")
      r3.current.setIdManual("slash")
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        r3.current.updateModelUrl(i, `https://civitai.com/models/${i + 10}`)
      }
    })
    host.resolveModelUrl.mockResolvedValue({
      filename: "dir/model.safetensors",
      downloadUrl: "https://civitai.com/models/10",
    })
    await act(async () => {
      await r3.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalled()

    // save skips resolve when filename already has an extension
    host.resolveModelUrl.mockClear()
    host.resolveModelUrl.mockResolvedValue({
      filename: "from-provider.safetensors",
      downloadUrl: "https://civitai.com/models/1",
    })
    act(() => {
      r3.current.applyArch("z-image")
      r3.current.setName("Cached")
      r3.current.setIdManual("cached")
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        r3.current.updateModelUrl(i, `https://civitai.com/models/${i + 20}`)
      }
    })
    for (let i = 0; i < r3.current.arch.slots.length; i++) {
      await act(async () => {
        await r3.current.resolveModelRow(
          i,
          `https://civitai.com/models/${i + 20}`
        )
      })
    }
    host.resolveModelUrl.mockClear()
    host.saveUserBlueprint.mockResolvedValueOnce(undefined)
    await act(async () => {
      await r3.current.handleSave()
    })
    expect(host.resolveModelUrl).not.toHaveBeenCalled()
    expect(host.saveUserBlueprint).toHaveBeenCalled()
  })

  it("rejects optional slot url with empty filename", async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() => useRecipeBlueprintForm({ onSaved }))
    notify.notifyError.mockClear()
    host.resolveModelUrl.mockReset()
    host.resolveModelUrl.mockResolvedValue({
      filename: "   ",
      downloadUrl: "https://files.example/",
    })
    act(() => {
      result.current.applyArch("sdxl")
    })
    act(() => {
      result.current.setName("Opt")
      result.current.setIdTouched(true)
      result.current.setIdManual("opt-empty")
      expect(result.current.arch.id).toBe("sdxl")
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        const slot = result.current.arch.slots[i]
        if (slot.required) {
          result.current.updateModelUrl(
            i,
            `https://cdn.example/${slot.role}.safetensors`
          )
        } else {
          result.current.updateModelUrl(i, "https://files.example/")
        }
      }
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      expect.stringMatching(/could not read a filename/i)
    )
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("covers load cancel, resolve skip, footer, and arch default fields", async () => {
    const onSaved = vi.fn()
    host.getBlueprint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: "slow",
                name: "Slow",
                arch: "z-image",
                models: [],
                defaults: {},
                capabilities: { negative: false },
                thumbnailPath: null,
              }),
            50
          )
        })
    )
    const { unmount } = renderHook(() =>
      useRecipeBlueprintForm({
        onSaved,
        editBlueprintId: "slow",
      })
    )
    unmount()

    const { result } = renderHook(() => useRecipeBlueprintForm({ onSaved }))
    act(() => {
      result.current.applyArch("chroma")
      result.current.setName("")
    })
    expect(result.current.footerStatus).toContain("needs a name")

    act(() => {
      result.current.setName("Chroma")
      result.current.setIdTouched(true)
      result.current.setIdManual("chroma")
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        const slot = result.current.arch.slots[i]
        result.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://f/${slot.role}.safetensors`
        )
      }
    })
    expect(result.current.footerStatus).toContain("models ready")

    await act(async () => {
      await result.current.resolveModelRow(0, "   ")
    })
    expect(host.resolveModelUrl).not.toHaveBeenCalled()

    act(() => {
      result.current.updateModelUrl(0, "https://cdn.example/direct.safetensors")
    })
    await act(async () => {
      await result.current.resolveModelRow(
        0,
        "https://cdn.example/direct.safetensors"
      )
    })

    host.getBlueprint.mockResolvedValueOnce({
      id: "with-thumb",
      name: "WT",
      arch: "z-image",
      models: [],
      defaults: {},
      capabilities: { negative: false },
      thumbnailPath: "/t.png",
    })
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const { result: r2 } = renderHook(() =>
      useRecipeBlueprintForm({ onSaved, editBlueprintId: "with-thumb" })
    )
    act(() => {
      r2.current.setPendingThumb({
        bytes: [1],
        ext: "png",
        previewUrl: "blob:x",
      })
    })
    await waitFor(() => expect(r2.current.loadingEdit).toBe(false))
    expect(revoke).toHaveBeenCalled()
    revoke.mockRestore()

    act(() => {
      r2.current.updateModelUrl(0, "https://civitai.com/models/1")
    })
    await act(async () => {
      await r2.current.resolveModelRow(0, "https://civitai.com/models/1")
    })
    act(() => {
      r2.current.updateModelUrl(0, "https://other.example/file.safetensors")
    })
    host.resolveModelUrl.mockResolvedValueOnce({
      filename: "late.safetensors",
      downloadUrl: "https://civitai.com/models/1",
    })
    await act(async () => {
      await r2.current.resolveModelRow(0, "https://civitai.com/models/1")
    })
  })

  it("covers load edge cases, invalid arch, and footer missing slots", async () => {
    const onSaved = vi.fn()
    const onEditCleared = vi.fn()

    host.getBlueprint.mockResolvedValueOnce({
      id: "rich",
      name: "Rich",
      description: null,
      arch: "not-real",
      sampler: "custom",
      scheduler: "custom",
      capabilities: null,
      defaults: { steps: 12, cfg: 6, guidance: 4 },
      models: [
        {
          role: "",
          path: "p",
          filename: "orphan.safetensors",
          url: "https://x/o.safetensors",
        },
        {
          role: "unet",
          path: "diffusion_models",
          filename: "u.safetensors",
          url: "https://x/u.safetensors",
        },
      ],
      thumbnailPath: null,
    })
    const { result } = renderHook(() =>
      useRecipeBlueprintForm({
        onSaved,
        editBlueprintId: "rich",
        onEditCleared,
      })
    )
    await waitFor(() => expect(result.current.loadingEdit).toBe(false))
    expect(result.current.archId).toBe("z-image")
    expect(result.current.description).toBe("")

    host.getBlueprint.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: "slow",
                name: "Slow",
                arch: "z-image",
                models: [],
                defaults: {},
                capabilities: { negative: false },
                thumbnailPath: null,
              }),
            50
          )
        })
    )
    const { unmount } = renderHook(() =>
      useRecipeBlueprintForm({ onSaved, editBlueprintId: "slow" })
    )
    unmount()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })

    host.getBlueprint.mockRejectedValueOnce("load string")
    renderHook(() =>
      useRecipeBlueprintForm({
        onSaved,
        editBlueprintId: "bad",
        onEditCleared,
      })
    )
    await waitFor(() => expect(onEditCleared).toHaveBeenCalled())

    const { result: r3 } = renderHook(() => useRecipeBlueprintForm({ onSaved }))
    act(() => r3.current.applyArch("not-an-arch" as never))
    expect(r3.current.archId).toBe("z-image")

    act(() => {
      r3.current.setName("Miss")
      r3.current.setIdTouched(true)
      r3.current.setIdManual("miss")
      r3.current.applyArch("z-image")
      r3.current.updateModelUrl(0, "")
    })
    expect(r3.current.footerStatus).toContain("model missing")
    expect(r3.current.missingSlots.length).toBeGreaterThan(0)

    act(() => {
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        const slot = r3.current.arch.slots[i]
        r3.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://cdn/${slot.role}.safetensors`
        )
      }
    })
    expect(r3.current.footerStatus).toContain("models ready")

    act(() => {
      r3.current.updateModelUrl(0, "https://civitai.com/models/no-ext")
    })
    expect(r3.current.models[0].filename).toBe("")

    host.resolveModelUrl.mockResolvedValueOnce({
      filename: "",
      downloadUrl: "https://civitai.com/models/no-ext",
    })
    await act(async () => {
      await r3.current.resolveModelRow(0, "https://civitai.com/models/no-ext")
    })

    host.resolveModelUrl.mockRejectedValueOnce("resolve str")
    await act(async () => {
      await r3.current.resolveModelRow(0, "https://civitai.com/models/1")
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      "resolve str",
      "Could not resolve model URL"
    )

    host.saveUserBlueprint.mockRejectedValueOnce("save str")
    act(() => {
      r3.current.setName("Save")
      r3.current.setIdManual("save")
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        const slot = r3.current.arch.slots[i]
        r3.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://cdn/${slot.role}.safetensors`
        )
      }
    })
    await act(async () => {
      await r3.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith("save str", "Save failed")

    const negArch = ARCHES.find((a) => !a.capabilities.negative)!
    act(() => {
      r3.current.applyArch(negArch.id)
      r3.current.setAllowNegative(true)
      r3.current.setName("Neg")
      r3.current.setIdManual("neg")
      for (let i = 0; i < r3.current.arch.slots.length; i++) {
        const slot = r3.current.arch.slots[i]
        r3.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://cdn/${slot.role}.safetensors`
        )
      }
    })
    host.saveUserBlueprint.mockResolvedValueOnce(undefined)
    await act(async () => {
      await r3.current.handleSave()
    })
    const negPayload = host.saveUserBlueprint.mock.calls.at(-1)?.[0] as
      { capabilities: { negative: boolean } } | undefined
    expect(negPayload?.capabilities.negative).toBe(false)

    host.getBlueprint.mockResolvedValueOnce({
      id: "edit2",
      name: "Edit2",
      arch: "z-image",
      models: [],
      defaults: {},
      capabilities: { negative: false },
      thumbnailPath: null,
    })
    const { result: r4 } = renderHook(() =>
      useRecipeBlueprintForm({ onSaved, editBlueprintId: "edit2" })
    )
    await waitFor(() => expect(r4.current.loadingEdit).toBe(false))
    act(() => {
      r4.current.setSampler("  ")
      r4.current.setScheduler("  ")
      for (let i = 0; i < r4.current.arch.slots.length; i++) {
        const slot = r4.current.arch.slots[i]
        r4.current.updateModelUrl(
          i,
          slot.defaultUrl ?? `https://cdn/${slot.role}.safetensors`
        )
      }
    })
    host.saveUserBlueprint.mockResolvedValueOnce(undefined)
    await act(async () => {
      await r4.current.handleSave()
    })
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      "Blueprint updated",
      "edit2"
    )
  })

  it("covers non-finite defaults, optional slot errors, and resolve reuse", async () => {
    const onSaved = vi.fn()
    host.getBlueprint.mockResolvedValueOnce({
      id: "nan",
      name: "Nan",
      arch: "z-image",
      models: [],
      defaults: { steps: "x", cfg: NaN, guidance: undefined },
      capabilities: { negative: false },
      thumbnailPath: null,
    })
    const { result } = renderHook(() =>
      useRecipeBlueprintForm({ onSaved, editBlueprintId: "nan" })
    )
    await waitFor(() => expect(result.current.loadingEdit).toBe(false))

    const requiredArch = ARCHES.find((a) => a.slots.every((s) => s.required))!
    act(() => {
      result.current.applyArch(requiredArch.id)
      result.current.setName("Req")
      result.current.setIdManual("req")
      result.current.setIdTouched(true)
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        result.current.updateModelUrl(
          i,
          `https://civitai.com/models/${i}?modelVersionId=1`
        )
      }
    })
    host.resolveModelUrl.mockResolvedValue({
      filename: "bad/name.safetensors",
      downloadUrl: "https://civitai.com/models/0",
    })
    await act(async () => {
      await result.current.handleSave()
    })
    expect(notify.notifyError).toHaveBeenCalledWith(
      expect.stringMatching(/could not read a filename/i)
    )

    host.resolveModelUrl.mockImplementation(async (url: string) => ({
      filename: "already.safetensors",
      downloadUrl: url,
    }))
    act(() => {
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        result.current.updateModelUrl(
          i,
          `https://cdn.example.com/${result.current.arch.slots[i].role}.safetensors`
        )
      }
    })
    const resolveCallsBefore = host.resolveModelUrl.mock.calls.length
    host.saveUserBlueprint.mockResolvedValueOnce(undefined)
    await act(async () => {
      await result.current.handleSave()
    })
    expect(host.resolveModelUrl.mock.calls.length).toBe(resolveCallsBefore)

    act(() => {
      result.current.setName("")
    })
    expect(result.current.footerStatus).toContain("needs a name")
    act(() => {
      result.current.setName("Two")
      result.current.setIdManual("two")
      for (let i = 0; i < result.current.arch.slots.length; i++) {
        result.current.updateModelUrl(i, "")
      }
    })
    expect(result.current.footerStatus).toContain("models missing")
  })
})
