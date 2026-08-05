import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LoraPack, UpscaleModelInfo } from "@/lib/host"

const listLoras = vi.fn(async (): Promise<LoraPack[]> => [])
const listUpscalers = vi.fn(async (): Promise<UpscaleModelInfo[]> => [])
const listModelFiles = vi.fn(async () => [])
const openModelsDir = vi.fn(async () => "/models")
const notifyError = vi.fn()
let loraProgress:
  ((p: { loraId: string; arch: string; stage: string }) => void) | null = null
let upscaleProgress: ((p: { modelId: string; stage: string }) => void) | null =
  null
let lorasUpdated: (() => void) | null = null
let upscalersUpdated: (() => void) | null = null

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    listLoras: () => listLoras(),
    listUpscalers: () => listUpscalers(),
    listModelFiles: () => listModelFiles(),
    openModelsDir: () => openModelsDir(),
    onLorasUpdated: (h: () => void) => {
      lorasUpdated = h
      return Promise.resolve(() => {})
    },
    onLoraProgress: (h: typeof loraProgress) => {
      loraProgress = h
      return Promise.resolve(() => {})
    },
    onUpscalersUpdated: (h: () => void) => {
      upscalersUpdated = h
      return Promise.resolve(() => {})
    },
    onUpscaleProgress: (h: typeof upscaleProgress) => {
      upscaleProgress = h
      return Promise.resolve(() => {})
    },
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
}))

import { ModelsLibraryDialog } from "./models-library-dialog"

describe("ModelsLibraryDialog", () => {
  beforeEach(() => {
    listLoras.mockReset().mockResolvedValue([])
    listUpscalers.mockReset().mockResolvedValue([])
    listModelFiles.mockReset().mockResolvedValue([])
    openModelsDir.mockReset().mockResolvedValue("/models")
    notifyError.mockReset()
    loraProgress = null
    upscaleProgress = null
  })

  it("loads tabs, installs, progress, and open folder", async () => {
    const user = userEvent.setup()
    const onInstallLora = vi.fn()
    const onInstallUpscaler = vi.fn()
    listLoras.mockResolvedValue([
      {
        id: "p1",
        name: "Lora1",
        description: "",
        source: "official",
        triggerWords: [],
        defaultStrength: 1,
        strengthMin: 0,
        strengthMax: 2,
        arches: ["flux"],
        variants: [
          {
            arch: "flux",
            filename: "f",
            path: "",
            url: "u",
            ready: false,
          },
          {
            arch: "bogus",
            filename: "b",
            path: "",
            url: "u",
            ready: false,
          },
        ],
        variantsReady: 0,
        variantCount: 2,
      },
    ])
    listUpscalers.mockResolvedValue([
      {
        id: "u1",
        name: "4x Model",
        kind: "sr",
        scale: 4,
        filename: "u.pth",
        ready: false,
        description: "nice",
      } as UpscaleModelInfo,
      {
        id: "u2",
        name: "Supir",
        kind: "supir",
        scale: 1,
        filename: "s.pth",
        ready: true,
        description: "",
      } as UpscaleModelInfo,
    ])
    listModelFiles.mockResolvedValue([
      { relativePath: "a.safetensors", bytes: 1024 },
    ])

    render(
      <ModelsLibraryDialog
        open
        onOpenChange={() => {}}
        preferArch="flux"
        onInstallLora={onInstallLora}
        onInstallUpscaler={onInstallUpscaler}
      />
    )

    await waitFor(() => expect(screen.getByText("Lora1")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: /^flux$/i }))
    expect(onInstallLora).toHaveBeenCalledWith("p1", "flux")

    await user.click(screen.getByRole("button", { name: /^bogus$/i }))
    expect(onInstallLora).toHaveBeenCalledTimes(1)

    // progress busy keys
    loraProgress?.({ loraId: "p1", arch: "flux", stage: "download" })
    loraProgress?.({ loraId: "p1", arch: "flux", stage: "download" })
    loraProgress?.({ loraId: "p1", arch: "flux", stage: "cancelled" })
    loraProgress?.({ loraId: "p1", arch: "flux", stage: "done" })
    lorasUpdated?.()

    await user.click(screen.getByRole("button", { name: /^Upscale$/i }))
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Install$/i })).toBeTruthy()
    )
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(onInstallUpscaler).toHaveBeenCalledWith("u1")
    upscaleProgress?.({ modelId: "u1", stage: "queued" })
    upscaleProgress?.({ modelId: "u1", stage: "queued" })
    upscaleProgress?.({ modelId: "u1", stage: "download" })
    upscaleProgress?.({ modelId: "u1", stage: "cancelled" })
    upscaleProgress?.({ modelId: "u1", stage: "error" })
    upscalersUpdated?.()

    await user.click(screen.getByRole("button", { name: /^Files$/i }))
    await waitFor(() => expect(screen.getByText("a.safetensors")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: /^LoRAs$/i }))
    await waitFor(() => expect(screen.getByText("Lora1")).toBeTruthy())

    await user.click(screen.getByRole("button", { name: /Open folder/i }))
    expect(openModelsDir).toHaveBeenCalled()
    openModelsDir.mockRejectedValueOnce(new Error("nope"))
    await user.click(screen.getByRole("button", { name: /Open folder/i }))
    expect(notifyError).toHaveBeenCalled()
    openModelsDir.mockRejectedValueOnce("folder fail")
    await user.click(screen.getByRole("button", { name: /Open folder/i }))
    expect(notifyError).toHaveBeenCalledWith(
      "folder fail",
      "Could not open folder"
    )
  })

  it("shows user packs, ready variants, loading tabs, and list string errors", async () => {
    const user = userEvent.setup()
    let resolveLoras!: (v: LoraPack[]) => void
    listLoras.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveLoras = r
        })
    )
    let resolveUps!: (v: UpscaleModelInfo[]) => void
    listUpscalers.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveUps = r
        })
    )
    let resolveFiles!: (v: { relativePath: string; bytes: number }[]) => void
    listModelFiles.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveFiles = r
        })
    )

    render(
      <ModelsLibraryDialog open onOpenChange={() => {}} preferArch="flux" />
    )
    expect(screen.getByText(/Loading…/)).toBeTruthy()

    resolveLoras([
      {
        id: "mine",
        name: "My Pack",
        description: "",
        source: "user",
        triggerWords: [],
        defaultStrength: 1,
        strengthMin: 0,
        strengthMax: 2,
        arches: ["flux", "z-image"],
        variants: [
          {
            arch: "flux",
            filename: "f",
            path: "",
            url: "u",
            ready: true,
          },
          {
            arch: "z-image",
            filename: "z",
            path: "",
            url: "u",
            ready: false,
          },
        ],
        variantsReady: 1,
        variantCount: 2,
      },
    ])
    await waitFor(() => expect(screen.getByText("My Pack")).toBeTruthy())
    expect(screen.getByText(/Mine/)).toBeTruthy()
    expect(screen.getByRole("button", { name: /flux ✓/i })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: /^Upscale$/i }))
    expect(screen.getAllByText(/Loading…/).length).toBeGreaterThan(0)
    resolveUps([
      {
        id: "u1",
        name: "Busy",
        kind: "sr",
        scale: 2,
        filename: "b.pth",
        ready: false,
        description: "desc",
      } as UpscaleModelInfo,
    ])
    await waitFor(() => expect(screen.getByText("desc")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    upscaleProgress?.({ modelId: "u1", stage: "queued" })
    upscaleProgress?.({ modelId: "u1", stage: "queued" })

    await user.click(screen.getByRole("button", { name: /^Files$/i }))
    expect(screen.getAllByText(/Loading…/).length).toBeGreaterThan(0)
    resolveFiles([{ relativePath: "w.safetensors", bytes: 512 }])
    await waitFor(() => expect(screen.getByText("w.safetensors")).toBeTruthy())

    listLoras.mockRejectedValueOnce("loras str")
    listUpscalers.mockRejectedValueOnce(new Error("up err"))
    listModelFiles.mockRejectedValueOnce("files str")
    lorasUpdated?.()
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("loras str", "LoRAs")
    )
  })

  it("handles empty/error load states and closed dialog", async () => {
    listLoras.mockRejectedValueOnce(new Error("L fail"))
    listUpscalers.mockRejectedValueOnce("U fail")
    listModelFiles.mockRejectedValueOnce(new Error("F fail"))
    const { rerender } = render(
      <ModelsLibraryDialog open onOpenChange={() => {}} />
    )
    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByText(/No LoRA packs yet/)).toBeTruthy()
    )

    const user = userEvent.setup()
    listUpscalers.mockResolvedValue([])
    listModelFiles.mockResolvedValue([])
    await user.click(screen.getByRole("button", { name: /^Upscale$/i }))
    await waitFor(() =>
      expect(screen.getByText(/No Official upscalers/)).toBeTruthy()
    )
    await user.click(screen.getByRole("button", { name: /^Files$/i }))
    await waitFor(() =>
      expect(screen.getByText(/No model files yet/)).toBeTruthy()
    )

    rerender(<ModelsLibraryDialog open={false} onOpenChange={() => {}} />)
    expect(screen.queryByText("Models library")).toBeNull()
  })
})
