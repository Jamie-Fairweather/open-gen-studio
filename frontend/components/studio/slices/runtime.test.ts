import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  listSettings: vi.fn(async () => ({})),
  runtimePinsStatus: vi.fn(async () => ({ comfy: { expected: "v9" } })),
  installComfyui: vi.fn(async () => {}),
  startComfyui: vi.fn(async () => {}),
  stopComfyui: vi.fn(async () => {}),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

import { notifyError, notifyInfo } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => vi.clearAllMocks())

describe("createRuntimeSlice", () => {
  it("install/start/stop and setters cover success and error paths", async () => {
    const store = createTestStudioStore()
    const s = store.getState()

    s.setRuntimes([{ engine: "comfyui", version: "v1" } as never])
    s.setGpu({ needsVendorChoice: true } as never)
    s.setRuntimeBusy(true)
    s.setRuntimeMessage("m")
    s.setComfyHealthy(true)

    await s.handleInstallComfy()
    expect(notifyError).toHaveBeenCalled()
    expect(host.installComfyui).not.toHaveBeenCalled()

    host.listSettings.mockRejectedValueOnce(new Error("settings"))
    store.setState({ gpu: { needsVendorChoice: true } as never })
    await store.getState().handleInstallComfy()
    expect(host.installComfyui).not.toHaveBeenCalled()

    host.listSettings.mockResolvedValueOnce({ gpu_vendor: "nvidia" })
    store.setState({
      gpu: { needsVendorChoice: true } as never,
      runtimes: [{ engine: "comfyui", version: "v1" } as never],
    })
    await store.getState().handleInstallComfy()
    expect(notifyInfo).toHaveBeenCalledWith(
      "Installing Runtime",
      "Installing ComfyUI v1",
      "runtime-install"
    )

    host.listSettings.mockResolvedValueOnce({ gpu_vendor: "nvidia" })
    store.setState({
      gpu: { needsVendorChoice: true } as never,
      runtimes: [],
    })
    host.runtimePinsStatus.mockRejectedValueOnce(new Error("no pin"))
    await store.getState().handleInstallComfy()
    expect(notifyInfo).toHaveBeenCalled()
    expect(host.installComfyui).toHaveBeenCalled()

    host.installComfyui.mockRejectedValueOnce(new Error("fail"))
    store.setState({ gpu: null, runtimeBusy: false })
    await store.getState().handleInstallComfy()
    expect(store.getState().runtimeBusy).toBe(false)
    expect(notifyError).toHaveBeenCalled()
    host.installComfyui.mockRejectedValueOnce("plain-install")
    await store.getState().handleInstallComfy()
    expect(notifyError).toHaveBeenCalledWith(
      "plain-install",
      "ComfyUI install failed"
    )

    store.setState({
      runtimes: [{ engine: "comfyui", version: "  " } as never],
    })
    host.runtimePinsStatus.mockResolvedValueOnce({ comfy: { expected: "v2" } })
    await store.getState().handleInstallComfy()

    await store.getState().handleStartComfy()
    host.startComfyui.mockRejectedValueOnce(new Error("bad"))
    await store.getState().handleStartComfy()
    expect(store.getState().comfyHealthy).toBe(false)
    host.startComfyui.mockRejectedValueOnce("plain-start")
    await store.getState().handleStartComfy()

    await store.getState().handleStopComfy()
    expect(store.getState().comfyHealthy).toBe(false)
    host.stopComfyui.mockRejectedValueOnce(new Error("stop"))
    await store.getState().handleStopComfy()
    expect(store.getState().runtimeBusy).toBe(false)
    host.stopComfyui.mockRejectedValueOnce("plain-stop")
    await store.getState().handleStopComfy()
    expect(notifyError).toHaveBeenCalledWith(
      "plain-stop",
      "Failed to stop ComfyUI"
    )
  })
})
