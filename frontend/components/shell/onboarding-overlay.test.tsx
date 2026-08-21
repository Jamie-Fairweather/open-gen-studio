/** @vitest-environment jsdom */
import type React from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const useMediaQuery = vi.hoisted(() => vi.fn(() => false))

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: (...a: unknown[]) => useMediaQuery(...a),
}))

vi.mock("@/lib/host/blueprints", () => ({
  getBlueprint: vi.fn(async () => ({
    id: "krea2-turbo",
    name: "Krea 2 Turbo",
    models: [],
    modelCount: 0,
  })),
}))

const store = vi.hoisted(() => ({
  startupHydrated: true,
  blueprintsLoaded: true,
  blueprints: [
    {
      id: "krea2-turbo",
      name: "Krea 2 Turbo",
      category: "image",
      description: "Fast",
      arch: "krea2",
      runtime: "comfyui",
      source: "official",
      minimumVramGb: null,
      modelCount: 1,
      modelsReady: 0,
      totalSizeBytes: null,
      localSizeBytes: 0,
      dir: "",
      thumbnailPath: null,
    },
  ] as never[],
  runtimes: [] as never[],
  gpu: null as null | {
    needsVendorChoice: boolean
    adapters: { vendor: string; name: string; memoryTotal: string | null }[]
  },
  hasHfToken: false,
  runtimeBusy: false,
  setRuntimeBusy: vi.fn((v: boolean) => {
    store.runtimeBusy = v
  }),
  runtimeMessage: null as string | null,
  downloadSnapshot: { active: null, queued: [], history: [] } as {
    active: null | {
      kind: string
      jobKey: string
      status: string
      error: string | null
    }
    queued: { kind: string; jobKey: string }[]
    history: {
      kind: string
      jobKey: string
      status: string
      error: string | null
    }[]
  },
  setDownloadSnapshot: vi.fn((next: unknown) => {
    store.downloadSnapshot =
      typeof next === "function"
        ? (
            next as (
              s: typeof store.downloadSnapshot
            ) => typeof store.downloadSnapshot
          )(store.downloadSnapshot)
        : (next as typeof store.downloadSnapshot)
  }),
  downloadSpeedBps: 0,
  handleInstallComfy: vi.fn(async () => {}),
  requestBlueprintInstall: vi.fn(async () => {}),
  selectBlueprint: vi.fn(),
  refreshProviderTokenStatus: vi.fn(async () => {}),
  setGpu: vi.fn((next: unknown) => {
    store.gpu =
      typeof next === "function"
        ? (next as (g: typeof store.gpu) => typeof store.gpu)(store.gpu)
        : (next as typeof store.gpu)
  }),
  setGpuVendorDialogOpen: vi.fn(),
  setOnboardingCoverReady: vi.fn(),
}))

const host = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  listSettings: vi.fn(async () => ({})),
  setSetting: vi.fn<(key: string, value: string) => Promise<void>>(
    async () => {}
  ),
  setProviderToken: vi.fn(async () => {}),
  openExternalUrl: vi.fn(async () => {}),
  getSystemSpecs: vi.fn(async () => ({
    ramBytes: 32 * 1024 ** 3,
    vramBytes: 12 * 1024 ** 3,
    gpuName: "Test GPU",
  })),
  detectGpu: vi.fn(async () => null),
  getDataDirInfo: vi.fn(async () => ({
    path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
    isCustom: false,
    locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
    defaultPath: "C:/Users/test/Open Gen Studio",
    storageChosen: true,
  })),
  pickDataDir: vi.fn(async () => null),
  setDataDir: vi.fn(async () => ({
    path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
    needsRestart: false,
    migrated: false,
  })),
  relaunchApp: vi.fn(async () => {}),
  listDownloads: vi.fn(async () => ({
    active: {
      kind: "runtime",
      jobKey: "runtime:comfyui",
      status: "queued",
      error: null,
    },
    queued: [],
    history: [],
  })),
}))

vi.mock("@/components/studio/store", () => {
  const useStudioStore = (sel: (s: typeof store) => unknown) => sel(store)
  useStudioStore.getState = () => store
  return { useStudioStore }
})

vi.mock("@/lib/host", () => ({
  isTauri: () => host.isTauri(),
  listSettings: (...a: unknown[]) => host.listSettings(...a),
  setSetting: (...a: unknown[]) => host.setSetting(...a),
  setProviderToken: (...a: unknown[]) => host.setProviderToken(...a),
  openExternalUrl: (...a: unknown[]) => host.openExternalUrl(...a),
  getSystemSpecs: (...a: unknown[]) => host.getSystemSpecs(...a),
  detectGpu: (...a: unknown[]) => host.detectGpu(...a),
  getDataDirInfo: (...a: unknown[]) => host.getDataDirInfo(...a),
  pickDataDir: (...a: unknown[]) => host.pickDataDir(...a),
  setDataDir: (...a: unknown[]) => host.setDataDir(...a),
  relaunchApp: (...a: unknown[]) => host.relaunchApp(...a),
  listDownloads: (...a: unknown[]) => host.listDownloads(...a),
  gallerySrc: (p: string) => p,
}))

vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

vi.mock("@/components/shell/titlebar", () => ({
  Titlebar: ({ leading }: { leading?: React.ReactNode }) => (
    <div data-testid="titlebar">{leading}</div>
  ),
}))

vi.mock("@/components/shell/onboarding-install-progress", () => ({
  OnboardingInstallProgress: ({ error }: { error: string | null }) => (
    <div data-testid="install-progress">
      {error ? `error:${error}` : "progress"}
    </div>
  ),
}))

import { OnboardingOverlay } from "./onboarding-overlay"

function readyComfy() {
  return {
    id: "r1",
    engine: "comfyui",
    status: "ready",
    installPath: "C:/comfy",
    version: "v1",
    port: 8188,
    error: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe("OnboardingOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useMediaQuery.mockReturnValue(false)
    host.isTauri.mockReturnValue(true)
    host.listSettings.mockResolvedValue({})
    host.setSetting.mockResolvedValue(undefined)
    host.setProviderToken.mockResolvedValue(undefined)
    host.openExternalUrl.mockResolvedValue(undefined)
    host.getSystemSpecs.mockResolvedValue({
      ramBytes: 32 * 1024 ** 3,
      vramBytes: 12 * 1024 ** 3,
      gpuName: "Test GPU",
    })
    host.detectGpu.mockResolvedValue(null)
    host.listDownloads.mockResolvedValue({
      active: {
        kind: "runtime",
        jobKey: "runtime:comfyui",
        status: "queued",
        error: null,
      },
      queued: [],
      history: [],
    })
    store.handleInstallComfy.mockResolvedValue(undefined)
    store.requestBlueprintInstall.mockResolvedValue(undefined)
    store.refreshProviderTokenStatus.mockResolvedValue(undefined)
    store.startupHydrated = true
    store.blueprintsLoaded = true
    store.runtimes = []
    store.hasHfToken = false
    store.gpu = null
    store.runtimeBusy = false
    store.runtimeMessage = null
    store.downloadSnapshot = { active: null, queued: [], history: [] }
    store.blueprints = [
      {
        id: "krea2-turbo",
        name: "Krea 2 Turbo",
        category: "image",
        description: "Fast",
        arch: "krea2",
        runtime: "comfyui",
        source: "official",
        minimumVramGb: null,
        modelCount: 1,
        modelsReady: 0,
        totalSizeBytes: null,
        localSizeBytes: 0,
        dir: "",
        thumbnailPath: "/thumb.png",
      },
      {
        id: "other-official",
        name: "Other Pack",
        category: "image",
        description: "Extra",
        arch: "sdxl",
        runtime: "comfyui",
        source: "official",
        minimumVramGb: null,
        modelCount: 1,
        modelsReady: 0,
        totalSizeBytes: null,
        localSizeBytes: 0,
        dir: "",
        thumbnailPath: null,
      },
    ] as never[]
  })

  async function waitForEnabled(name: string | RegExp) {
    await waitFor(() => {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    })
  }

  it("does not render outside Tauri", async () => {
    host.isTauri.mockReturnValue(false)
    const { container } = render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(container.firstChild).toBeNull()
    })
  })

  it("shows storage first when not chosen yet", async () => {
    const user = userEvent.setup()
    host.getDataDirInfo.mockResolvedValueOnce({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    expect(screen.getByText("Setup · Storage")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Default location/i })
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(host.setDataDir).toHaveBeenCalledWith(null)
    })
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
  })

  it("skips the step fade when reduced motion is preferred", async () => {
    const user = userEvent.setup()
    useMediaQuery.mockReturnValue(true)
    host.getDataDirInfo.mockResolvedValueOnce({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
  })

  it("shows hardware warning first when under minimum specs", async () => {
    const user = userEvent.setup()
    host.getSystemSpecs.mockResolvedValue({
      ramBytes: 8 * 1024 ** 3,
      vramBytes: 2 * 1024 ** 3,
      gpuName: "Intel Iris Xe",
    })
    host.getDataDirInfo.mockResolvedValueOnce({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText("This PC may be under-powered")
    ).toBeInTheDocument()
    expect(screen.getByText("Setup · Hardware")).toBeInTheDocument()
    expect(
      screen.getByText(/Detected GPU:\s*Intel Iris Xe/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue anyway" }))
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    await waitFor(() => {
      expect(host.setSetting).toHaveBeenCalledWith(
        "ui_onboarding_v1",
        expect.stringContaining('"specsBypassed":true')
      )
    })
    await waitForEnabled("Back")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(
      await screen.findByText("This PC may be under-powered")
    ).toBeInTheDocument()
  })

  it("fills VRAM from detectGpu when getSystemSpecs is denied", async () => {
    host.getSystemSpecs.mockRejectedValueOnce(new Error("not allowed"))
    host.detectGpu.mockResolvedValueOnce({
      available: true,
      name: "NVIDIA GeForce RTX 4080 SUPER",
      memoryTotal: "16376 MiB",
      driverVersion: null,
      vendor: "nvidia",
      nvidiaVariant: null,
      needsVendorChoice: true,
      adapters: [
        {
          vendor: "nvidia",
          name: "NVIDIA GeForce RTX 4080 SUPER",
          memoryTotal: "16376 MiB",
          driverVersion: null,
          computeCap: null,
          cudaVersion: null,
        },
      ],
      error: null,
    })
    host.getDataDirInfo.mockResolvedValueOnce({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    // RAM unknown + 16GB VRAM still fails the 16GB RAM floor → hardware step.
    expect(
      await screen.findByText("This PC may be under-powered")
    ).toBeInTheDocument()
    expect(screen.getByText("15.9 GB")).toBeInTheDocument()
    expect(
      screen.getByText(/Detected GPU:\s*NVIDIA GeForce RTX 4080 SUPER/)
    ).toBeInTheDocument()
  })

  it("still boots Hardware when detectGpu fails", async () => {
    host.getSystemSpecs.mockResolvedValueOnce({
      ramBytes: 8 * 1024 ** 3,
      vramBytes: 2 * 1024 ** 3,
      gpuName: "Intel Iris Xe",
    })
    host.detectGpu.mockRejectedValueOnce(new Error("gpu probe failed"))
    host.getDataDirInfo.mockResolvedValueOnce({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText("This PC may be under-powered")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Detected GPU:\s*Intel Iris Xe/)
    ).toBeInTheDocument()
  })

  it("returns from blueprint to storage when GPU is not required", async () => {
    const user = userEvent.setup()
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
    await waitForEnabled("Back")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
  })

  it("returns from GPU to storage, then relocates with overlay + relaunch", async () => {
    const user = userEvent.setup()
    store.gpu = {
      needsVendorChoice: true,
      adapters: [{ vendor: "nvidia", name: "RTX", memoryTotal: "12 GB" }],
    }
    host.getDataDirInfo.mockResolvedValue({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: true,
    })
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "gpu",
        blueprintId: null,
        hfSkipped: false,
      }),
    })
    host.pickDataDir.mockResolvedValueOnce("D:/Open Gen Studio")
    host.setDataDir.mockResolvedValueOnce({
      path: "D:/Open Gen Studio",
      needsRestart: true,
      migrated: true,
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
    await waitForEnabled("Back")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    await waitFor(() => expect(host.pickDataDir).toHaveBeenCalled())
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(host.setDataDir).toHaveBeenCalledWith("D:/Open Gen Studio")
      expect(host.relaunchApp).toHaveBeenCalled()
    })
  })

  it("handles custom pick cancel, pick errors, and confirm failures", async () => {
    const user = userEvent.setup()
    host.getDataDirInfo.mockResolvedValue({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: false,
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()

    host.pickDataDir.mockResolvedValueOnce(null)
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    await waitFor(() => expect(host.pickDataDir).toHaveBeenCalled())
    expect(host.setDataDir).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled()
    // Defensive no-op if Continue is invoked without a custom path.
    await userEvent
      .setup({ pointerEventsCheck: 0 })
      .click(screen.getByRole("button", { name: "Continue" }))
    expect(host.setDataDir).not.toHaveBeenCalled()

    // Switching back to default clears custom mode and re-enables Continue.
    await user.click(screen.getByRole("button", { name: /Default location/i }))
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled()

    host.pickDataDir.mockRejectedValueOnce(new Error("picker blew up"))
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not choose folder"
    )
    expect(screen.getByRole("alert")).toHaveTextContent("picker blew up")

    host.pickDataDir.mockResolvedValueOnce("D:/Open Gen Studio")
    host.setDataDir.mockRejectedValueOnce("disk full")
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not set data folder"
    )
    expect(screen.getByRole("alert")).toHaveTextContent("disk full")
  })

  it("ends a relocate overlay when move succeeds without restart", async () => {
    const user = userEvent.setup()
    const { getDataDirMoveActive, endDataDirMove } =
      await import("@/lib/data-dir-move")
    endDataDirMove()
    store.gpu = {
      needsVendorChoice: true,
      adapters: [{ vendor: "nvidia", name: "RTX", memoryTotal: null }],
    }
    host.getDataDirInfo
      .mockResolvedValueOnce({
        path: "C:/Old",
        isCustom: true,
        locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
        defaultPath: "C:/Users/test/Open Gen Studio",
        storageChosen: true,
      })
      .mockResolvedValueOnce({
        path: "D:/New",
        isCustom: true,
        locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
        defaultPath: "C:/Users/test/Open Gen Studio",
        storageChosen: true,
      })
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "gpu",
        blueprintId: null,
        hfSkipped: false,
      }),
    })
    host.pickDataDir.mockResolvedValueOnce("D:/New")
    host.setDataDir.mockResolvedValueOnce({
      path: "D:/New",
      needsRestart: false,
      migrated: true,
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    await waitFor(() => expect(host.pickDataDir).toHaveBeenCalled())
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(host.setDataDir).toHaveBeenCalledWith("D:/New")
    })
    expect(getDataDirMoveActive()).toBe(false)
  })

  it("ends the relocate overlay when a move fails", async () => {
    const user = userEvent.setup()
    const { getDataDirMoveActive, endDataDirMove } =
      await import("@/lib/data-dir-move")
    endDataDirMove()
    store.gpu = {
      needsVendorChoice: true,
      adapters: [{ vendor: "nvidia", name: "RTX", memoryTotal: null }],
    }
    host.getDataDirInfo.mockResolvedValue({
      path: "C:/Old",
      isCustom: true,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: true,
    })
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "gpu",
        blueprintId: null,
        hfSkipped: false,
      }),
    })
    host.pickDataDir.mockResolvedValueOnce("D:/New")
    host.setDataDir.mockRejectedValueOnce(new Error("copy failed"))
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await screen.findByText("Choose data folder")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Custom location/i }))
    await waitFor(() => expect(host.pickDataDir).toHaveBeenCalled())
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not set data folder"
    )
    expect(screen.getByRole("alert")).toHaveTextContent("copy failed")
    expect(getDataDirMoveActive()).toBe(false)
  })

  it("shows blueprint first, then HF, then install after skip", async () => {
    const user = userEvent.setup()
    render(<OnboardingOverlay />)

    const dialog = await screen.findByRole("dialog", {
      name: "Set up Open Gen Studio",
    })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass("z-[120]")
    expect(screen.getByText("Open Gen Studio")).toBeInTheDocument()
    expect(screen.getByText("Setup · Blueprint")).toBeInTheDocument()
    expect(screen.getByText("Pick your first Blueprint")).toBeInTheDocument()
    expect(screen.getByText("Krea 2 Turbo")).toBeInTheDocument()
    expect(screen.getByText("More Official")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Other Pack/i }))
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(await screen.findByText("Hugging Face token")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "Create a read-only token on Hugging Face",
      })
    )
    expect(host.openExternalUrl).toHaveBeenCalled()
    await waitForEnabled("Skip for now")
    await user.click(screen.getByRole("button", { name: "Skip for now" }))

    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    expect(host.setSetting).toHaveBeenCalled()
  })

  it("saves an HF token and continues to install", async () => {
    const user = userEvent.setup()
    render(<OnboardingOverlay />)
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("Hugging Face token")).toBeInTheDocument()
    await user.type(
      screen.getByLabelText("Hugging Face access token"),
      "hf_test"
    )
    await user.click(screen.getByRole("button", { name: "Save and continue" }))
    await waitFor(() => {
      expect(host.setProviderToken).toHaveBeenCalledWith(
        "huggingFace",
        "hf_test"
      )
    })
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
  })

  it("surfaces an HF save error on the step", async () => {
    const user = userEvent.setup()
    host.setProviderToken.mockRejectedValueOnce(new Error("token rejected"))
    render(<OnboardingOverlay />)
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("Hugging Face token")).toBeInTheDocument()
    await user.type(
      screen.getByLabelText("Hugging Face access token"),
      "hf_test"
    )
    await user.click(screen.getByRole("button", { name: "Save and continue" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save token"
    )
    expect(screen.getByRole("alert")).toHaveTextContent("token rejected")
    expect(screen.getByText("Hugging Face token")).toBeInTheDocument()
  })

  it("skips HF when a token is already saved", async () => {
    const user = userEvent.setup()
    store.hasHfToken = true
    render(<OnboardingOverlay />)

    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    expect(screen.queryByText("Hugging Face token")).toBeNull()
  })

  it("walks GPU → blueprint with back navigation", async () => {
    const user = userEvent.setup()
    store.gpu = {
      needsVendorChoice: true,
      adapters: [
        { vendor: "nvidia", name: "RTX", memoryTotal: "12 GB" },
        { vendor: "amd", name: "RX", memoryTotal: null },
      ],
    }
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "gpu",
        blueprintId: null,
        hfSkipped: false,
      }),
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /AMD/i }))
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() => {
      expect(host.setSetting).toHaveBeenCalledWith("gpu_vendor", "amd")
    })
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
    await waitForEnabled("Back")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
  })

  it("stays on GPU and surfaces a save error", async () => {
    const user = userEvent.setup()
    store.gpu = {
      needsVendorChoice: true,
      adapters: [
        { vendor: "nvidia", name: "RTX", memoryTotal: "12 GB" },
        { vendor: "amd", name: "RX", memoryTotal: null },
      ],
    }
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "gpu",
        blueprintId: null,
        hfSkipped: false,
      }),
    })
    host.setSetting.mockImplementation(async (key) => {
      if (key === "gpu_vendor") throw new Error("GPU vendor write failed")
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Choose your GPU")).toBeInTheDocument()
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save GPU"
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "GPU vendor write failed"
    )
    expect(screen.getByText("Choose your GPU")).toBeInTheDocument()
    expect(screen.queryByText("Pick your first Blueprint")).toBeNull()
  })

  it("uses reduced-motion stage handoff and HF back", async () => {
    const user = userEvent.setup()
    useMediaQuery.mockReturnValue(true)
    render(<OnboardingOverlay />)
    await waitForEnabled("Continue")
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByText("Hugging Face token")).toBeInTheDocument()
    await waitForEnabled("Back")
    await user.click(screen.getByRole("button", { name: "Back" }))
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
  })

  it("resumes on install step from persisted state", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
    expect(store.requestBlueprintInstall).not.toHaveBeenCalled()
  })

  it("prefers persisted blueprint id and skips HF resume when token exists", async () => {
    store.hasHfToken = true
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "hf",
        blueprintId: "other-official",
        hfSkipped: false,
      }),
    })
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText(/Installing Other Pack|Installing ComfyUI/)
    ).toBeInTheDocument()
  })

  it("enqueues blueprint only after Comfy is ready", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.requestBlueprintInstall).toHaveBeenCalledWith("krea2-turbo")
    })
    expect(store.handleInstallComfy).not.toHaveBeenCalled()
  })

  it("finishes when Comfy and blueprint become installed", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    const { rerender } = render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.requestBlueprintInstall).toHaveBeenCalled()
    })
    store.blueprints = [
      {
        ...store.blueprints[0]!,
        modelsReady: 1,
      },
    ] as never[]
    rerender(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.selectBlueprint).toHaveBeenCalledWith("krea2-turbo")
    })
  })

  it("exits once onboarding is no longer needed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      host.listSettings.mockResolvedValue({
        ui_onboarding_v1: JSON.stringify({
          step: "install",
          blueprintId: "krea2-turbo",
          hfSkipped: true,
        }),
      })
      const { rerender } = render(<OnboardingOverlay />)
      expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()

      store.runtimes = [readyComfy()] as never[]
      store.blueprints = [
        {
          ...store.blueprints[0],
          modelsReady: 1,
        },
      ] as never[]
      rerender(<OnboardingOverlay />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Set up Open Gen Studio" })
        ).toBeNull()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows retry for Comfy install errors", async () => {
    const user = userEvent.setup()
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [
      {
        ...readyComfy(),
        status: "error",
        error: "boom",
      },
    ] as never[]
    render(<OnboardingOverlay />)
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
  })

  it("records Comfy retry failures from host calls", async () => {
    const user = userEvent.setup()
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [
      {
        ...readyComfy(),
        status: "error",
        error: "boom",
      },
    ] as never[]
    store.handleInstallComfy.mockRejectedValueOnce(new Error("retry-fail"))
    render(<OnboardingOverlay />)
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
    expect(await screen.findByTestId("install-progress")).toHaveTextContent(
      "retry-fail"
    )
  })

  it("shows retry when Comfy extract failed after app restart", async () => {
    const user = userEvent.setup()
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimeBusy = true
    store.downloadSnapshot = {
      active: null,
      queued: [],
      history: [
        {
          kind: "runtime",
          jobKey: "runtime:comfyui",
          status: "error",
          error: "extract interrupted",
        },
      ],
    }
    render(<OnboardingOverlay />)
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByTestId("install-progress")).toHaveTextContent(
      "extract interrupted"
    )
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => {
      expect(store.setRuntimeBusy).toHaveBeenCalledWith(false)
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
  })

  it("shows retry for blueprint job errors and allows requeue", async () => {
    const user = userEvent.setup()
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    store.downloadSnapshot = {
      active: {
        kind: "blueprint",
        jobKey: "blueprint:krea2-turbo",
        status: "error",
        error: "bp failed",
      },
      queued: [],
      history: [],
    }
    render(<OnboardingOverlay />)
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => {
      expect(store.requestBlueprintInstall).toHaveBeenCalledWith("krea2-turbo")
    })
  })

  it("records blueprint retry failures from host calls", async () => {
    const user = userEvent.setup()
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    store.downloadSnapshot = {
      active: {
        kind: "blueprint",
        jobKey: "blueprint:krea2-turbo",
        status: "error",
        error: "bp failed",
      },
      queued: [],
      history: [],
    }
    store.requestBlueprintInstall.mockRejectedValueOnce(new Error("bp-retry"))
    render(<OnboardingOverlay />)
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => {
      expect(store.requestBlueprintInstall).toHaveBeenCalledWith("krea2-turbo")
    })
    expect(await screen.findByTestId("install-progress")).toHaveTextContent(
      "bp-retry"
    )
  })

  it("errors when Comfy install does not queue a runtime job", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    host.listDownloads.mockResolvedValue({
      active: {
        kind: "blueprint",
        jobKey: "blueprint:krea2-turbo",
        status: "queued",
        error: null,
      },
      queued: [{ kind: "blueprint", jobKey: "blueprint:other" }],
      history: [],
    })
    render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByTestId("install-progress")).toHaveTextContent(
      "did not queue a download job"
    )
  })

  it("accepts a runtime job that is queued rather than active", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    host.listDownloads.mockResolvedValue({
      active: {
        kind: "blueprint",
        jobKey: "blueprint:krea2-turbo",
        status: "queued",
        error: null,
      },
      queued: [{ kind: "runtime", jobKey: "runtime:comfyui" }],
      history: [],
    })
    render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
    expect(screen.getByTestId("install-progress")).not.toHaveTextContent(
      "did not queue a download job"
    )
  })

  it("records install failures from host calls", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.handleInstallComfy.mockRejectedValue(new Error("install-fail"))
    render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByTestId("install-progress")).toHaveTextContent(
      "install-fail"
    )
  })

  it("records blueprint enqueue failures", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    store.requestBlueprintInstall.mockRejectedValue(new Error("bp-fail"))
    render(<OnboardingOverlay />)
    await waitFor(() => {
      expect(store.requestBlueprintInstall).toHaveBeenCalled()
    })
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByTestId("install-progress")).toHaveTextContent("bp-fail")
  })

  it("treats an already-queued blueprint job as started", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimes = [readyComfy()] as never[]
    store.downloadSnapshot = {
      active: {
        kind: "blueprint",
        jobKey: "blueprint:krea2-turbo",
        status: "running",
        error: null,
      },
      queued: [],
      history: [],
    }
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText(/Installing Krea 2 Turbo/)
    ).toBeInTheDocument()
    expect(store.requestBlueprintInstall).not.toHaveBeenCalled()
  })

  it("waits while a runtime job is already pending", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimeBusy = true
    store.downloadSnapshot = {
      active: {
        kind: "runtime",
        jobKey: "runtime:comfyui",
        status: "running",
        error: null,
      },
      queued: [],
      history: [],
    }
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    expect(store.handleInstallComfy).not.toHaveBeenCalled()
  })

  it("keeps ComfyUI title while extensions run after runtime is marked ready", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    // Configure step marks DB status ready before the extensions step finishes.
    store.runtimes = [readyComfy()] as never[]
    store.downloadSnapshot = {
      active: {
        kind: "runtime",
        jobKey: "runtime:comfyui",
        status: "running",
        error: null,
      },
      queued: [],
      history: [],
    }
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    expect(screen.queryByText(/Installing Krea 2 Turbo/)).toBeNull()
    expect(store.requestBlueprintInstall).not.toHaveBeenCalled()
  })

  it("treats a queued runtime job as pending", async () => {
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.downloadSnapshot = {
      active: null,
      queued: [{ kind: "runtime", jobKey: "runtime:comfyui" }],
      history: [],
    }
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    expect(store.handleInstallComfy).not.toHaveBeenCalled()
  })

  it("does not treat runtimeBusy alone as an in-flight install", async () => {
    // A busy flag without a download job used to leave onboarding stuck on
    // "Starting ComfyUI install…" forever — kick install again instead.
    host.listSettings.mockResolvedValue({
      ui_onboarding_v1: JSON.stringify({
        step: "install",
        blueprintId: "krea2-turbo",
        hfSkipped: true,
      }),
    })
    store.runtimeBusy = true
    render(<OnboardingOverlay />)
    expect(await screen.findByText("Installing ComfyUI")).toBeInTheDocument()
    await waitFor(() => {
      expect(store.handleInstallComfy).toHaveBeenCalled()
    })
  })

  it("handles listSettings failure during bootstrap", async () => {
    host.listSettings.mockRejectedValueOnce(new Error("settings"))
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
  })

  it("handles getDataDirInfo failure during bootstrap", async () => {
    host.getDataDirInfo.mockRejectedValueOnce(new Error("data dir"))
    render(<OnboardingOverlay />)
    expect(
      await screen.findByText("Pick your first Blueprint")
    ).toBeInTheDocument()
  })

  it("cancels bootstrap when unmounted mid-load", async () => {
    let resolveSettings: (v: Record<string, string>) => void = () => {}
    host.listSettings.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve
        })
    )
    const { unmount } = render(<OnboardingOverlay />)
    unmount()
    await act(async () => {
      resolveSettings({})
    })
    expect(store.setGpuVendorDialogOpen).not.toHaveBeenCalled()
  })
})
