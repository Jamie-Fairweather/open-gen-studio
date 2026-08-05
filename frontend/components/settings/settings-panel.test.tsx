/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { GpuAdapter, GpuInfo, RuntimeInstall } from "@/lib/host"
import {
  SETTING_GPU_VENDOR,
  SETTING_NVIDIA_PORTABLE_OVERRIDE,
} from "@/components/studio/slices/helpers"

const host = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  runtimePinsStatus: vi.fn(async () => ({
    comfy: { id: "comfy", expected: "v1", installed: "v1", matches: true },
    nodes: [],
  })),
  listSettings: vi.fn(async () => ({})),
  setSetting: vi.fn(async () => {}),
  openExternalUrl: vi.fn(async () => {}),
}))

const notify = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notify: vi.fn(),
  notifyInfo: vi.fn(),
  notifyProgress: vi.fn(),
  notifyDismiss: vi.fn(),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", () => notify)

import { SettingsPanel } from "./settings-panel"

const nvidia: GpuAdapter = {
  vendor: "nvidia",
  name: "RTX",
  memoryTotal: "24 GB",
  driverVersion: "1",
  computeCap: null,
  cudaVersion: null,
}
const amd: GpuAdapter = {
  vendor: "amd",
  name: "RX",
  memoryTotal: "16 GB",
  driverVersion: null,
  computeCap: null,
  cudaVersion: null,
}

const gpuInfo: GpuInfo = {
  available: true,
  name: "RTX",
  memoryTotal: "24 GB",
  driverVersion: "1",
  vendor: "nvidia",
  nvidiaVariant: "modern",
  needsVendorChoice: true,
  error: null,
  adapters: [nvidia, amd],
}

const comfy: RuntimeInstall = {
  id: "comfy",
  engine: "comfyui",
  version: "v1",
  installPath: "/c",
  port: 8188,
  status: "stopped",
  error: null,
  createdAt: 0,
  updatedAt: 0,
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    onBrowseModels: vi.fn(),
    comfy,
    comfyHealthy: false,
    runtimeMessage: null,
    runtimeBusy: false,
    onInstallComfy: vi.fn(),
    onStartComfy: vi.fn(),
    onStopComfy: vi.fn(),
    hasHfToken: false,
    hfToken: "",
    onHfTokenChange: vi.fn(),
    hfTokenDirty: false,
    hfTokenSaving: false,
    onSaveHfToken: vi.fn(),
    onClearHfToken: vi.fn(),
    hasCivitaiToken: false,
    civitaiToken: "",
    onCivitaiTokenChange: vi.fn(),
    civitaiTokenDirty: false,
    civitaiTokenSaving: false,
    onSaveCivitaiToken: vi.fn(),
    onClearCivitaiToken: vi.fn(),
    gpu: gpuInfo,
    onGpuVendorChanged: vi.fn(),
    ...overrides,
  }
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    host.isTauri.mockReset().mockReturnValue(false)
    host.runtimePinsStatus.mockReset().mockResolvedValue({
      comfy: { id: "comfy", expected: "v1", installed: "v1", matches: true },
      nodes: [],
    })
    host.listSettings.mockReset().mockResolvedValue({})
    host.setSetting.mockReset().mockResolvedValue(undefined)
    notify.notifyError.mockReset()
    notify.notifySuccess.mockReset()
  })

  it("skips host load when not Tauri", async () => {
    render(<SettingsPanel {...props()} />)
    expect(screen.getByText("Settings")).toBeInTheDocument()
    expect(host.runtimePinsStatus).not.toHaveBeenCalled()
  })

  it("loads pins/settings, saves nvidia override, and changes GPU", async () => {
    const user = userEvent.setup()
    host.isTauri.mockReturnValue(true)
    host.listSettings.mockResolvedValue({
      [SETTING_GPU_VENDOR]: "nvidia",
      [SETTING_NVIDIA_PORTABLE_OVERRIDE]: "modern",
    })
    const p = props()
    const { rerender, unmount } = render(<SettingsPanel {...p} />)

    await waitFor(() => expect(host.runtimePinsStatus).toHaveBeenCalled())
    await waitFor(() => expect(host.listSettings).toHaveBeenCalled())
    expect(await screen.findByText(/\(override\)/)).toBeInTheDocument()

    const openOverride = async () => {
      await user.click(screen.getByRole("combobox"))
    }

    await openOverride()
    await user.click(await screen.findByRole("option", { name: /Auto/i }))
    await waitFor(() =>
      expect(host.setSetting).toHaveBeenCalledWith(
        SETTING_NVIDIA_PORTABLE_OVERRIDE,
        ""
      )
    )
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      "NVIDIA portable override cleared"
    )

    host.setSetting.mockRejectedValueOnce(new Error("nope"))
    await openOverride()
    await user.click(
      await screen.findByRole("option", { name: /Force cu126/i })
    )
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith("nope"))

    host.setSetting.mockRejectedValueOnce("bad")
    await openOverride()
    await user.click(
      await screen.findByRole("option", { name: /Force modern/i })
    )
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalledWith("bad"))

    host.setSetting.mockResolvedValue(undefined)
    await openOverride()
    await user.click(
      await screen.findByRole("option", { name: /Force cu126/i })
    )
    await waitFor(() =>
      expect(notify.notifySuccess).toHaveBeenCalledWith(
        "NVIDIA portable override set to cu126"
      )
    )

    await user.click(screen.getByRole("button", { name: /Change GPU/i }))
    expect(screen.getByText("Choose your GPU")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /AMD/i }))
    await user.click(screen.getByRole("button", { name: "Continue" }))
    await waitFor(() =>
      expect(host.setSetting).toHaveBeenCalledWith(SETTING_GPU_VENDOR, "amd")
    )
    expect(p.onGpuVendorChanged).toHaveBeenCalled()
    expect(p.onInstallComfy).toHaveBeenCalled()

    host.runtimePinsStatus.mockRejectedValueOnce(new Error("pins"))
    host.listSettings.mockRejectedValueOnce(new Error("settings"))
    rerender(
      <SettingsPanel {...props({ comfy: { ...comfy, status: "running" } })} />
    )
    await waitFor(() => expect(host.runtimePinsStatus).toHaveBeenCalled())

    host.isTauri.mockReturnValue(true)
    host.listSettings.mockResolvedValue({
      [SETTING_GPU_VENDOR]: "weird",
      [SETTING_NVIDIA_PORTABLE_OVERRIDE]: "nope",
    })
    unmount()
    render(<SettingsPanel {...props({ onGpuVendorChanged: undefined })} />)
    await waitFor(() => expect(host.listSettings).toHaveBeenCalled())
  })

  it("handles null gpu, effect cancel, and pins failure", async () => {
    host.isTauri.mockReturnValue(true)
    host.runtimePinsStatus.mockRejectedValueOnce(new Error("pins"))
    let resolveSettings!: (v: Record<string, string>) => void
    host.listSettings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSettings = resolve
        })
    )
    const { unmount } = render(<SettingsPanel {...props({ gpu: null })} />)
    unmount()
    resolveSettings({ [SETTING_GPU_VENDOR]: "nvidia" })

    host.runtimePinsStatus.mockResolvedValue({
      comfy: { id: "comfy", expected: "v1", installed: "v1", matches: true },
      nodes: [],
    })
    host.listSettings.mockResolvedValue({})
    render(<SettingsPanel {...props({ gpu: null })} />)
    await waitFor(() => expect(host.runtimePinsStatus).toHaveBeenCalled())
  })

  it("loads saved vendor override and handles AMD effective variant", async () => {
    host.isTauri.mockReturnValue(true)
    host.listSettings.mockResolvedValue({
      [SETTING_GPU_VENDOR]: " amd ",
      [SETTING_NVIDIA_PORTABLE_OVERRIDE]: " weird ",
    })
    const amdGpu: GpuInfo = {
      ...gpuInfo,
      vendor: "amd",
      nvidiaVariant: null,
      adapters: [amd],
    }
    render(<SettingsPanel {...props({ gpu: amdGpu })} />)
    await waitFor(() => expect(host.listSettings).toHaveBeenCalled())
    expect(screen.queryByText(/\(override\)/)).toBeNull()
  })

  it("falls back to first adapter when saved vendor is missing", async () => {
    host.isTauri.mockReturnValue(true)
    host.listSettings.mockResolvedValue({
      [SETTING_GPU_VENDOR]: "intel",
    })
    render(
      <SettingsPanel
        {...props({
          gpu: {
            ...gpuInfo,
            vendor: "nvidia",
            adapters: [nvidia, amd],
          },
        })}
      />
    )
    await waitFor(() => expect(host.listSettings).toHaveBeenCalled())
    expect(screen.getByText("RTX")).toBeInTheDocument()
  })
})
