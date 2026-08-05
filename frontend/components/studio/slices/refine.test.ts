import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  providerTokenStatus: vi.fn(async () => ({
    huggingface: false,
    civitai: false,
  })),
  ensureDownload: vi.fn(async () => ({ status: "queued", jobId: "d1" })),
  uninstallLoraVariant: vi.fn(async () => ({ removed: 1, kept: 0 })),
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
  flushPersistSession: vi.fn(),
  schedulePersistSession: vi.fn(),
}))

import { notifyError, notifySuccess } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => vi.clearAllMocks())

describe("createRefineSlice", () => {
  it("setters and install helpers cover token gate and ready paths", async () => {
    const store = createTestStudioStore()
    const s = store.getState()

    s.setLoraStack([{ id: "l", strength: 1 }])
    s.setUpscaleEnabled(true)
    s.setUpscaleModelId("m")
    s.setUsduEnabled(true)
    s.setUsduScale(4)
    s.setUsduSteps(10)
    s.setUsduDenoise(0.2)

    store.setState({
      loraPacks: [
        {
          id: "lora1",
          variants: [
            { arch: "flux", url: "https://civitai.com/x" },
            { arch: "sdxl", url: "https://hf.co/y" },
          ],
        } as never,
      ],
    })

    await store.getState().beginLoraInstall("lora1", "flux")
    expect(store.getState().civitaiTokenDialogOpen).toBe(true)
    expect(host.ensureDownload).not.toHaveBeenCalled()

    host.providerTokenStatus.mockResolvedValueOnce({
      huggingface: false,
      civitai: true,
    })
    await store.getState().beginLoraInstall("lora1", "flux")
    expect(host.ensureDownload).toHaveBeenCalled()

    await store.getState().beginLoraInstall("missing", "flux")
    host.ensureDownload.mockRejectedValueOnce(new Error("e"))
    await store.getState().beginLoraInstall("lora1", "sdxl")
    expect(notifyError).toHaveBeenCalled()
    host.ensureDownload.mockRejectedValueOnce("plain-lora")
    await store.getState().beginLoraInstall("lora1", "sdxl")
    expect(notifyError).toHaveBeenCalledWith(
      "plain-lora",
      "LoRA install failed"
    )

    await store.getState().beginUpscaleInstall("u1")
    expect(store.getState().pendingUpscaleIds).toContain("u1")
    await store.getState().beginUpscaleInstall("u1")
    host.ensureDownload.mockResolvedValueOnce({ status: "ready", jobId: null })
    await store.getState().beginUpscaleInstall("u2")
    expect(store.getState().pendingUpscaleIds).not.toContain("u2")

    host.ensureDownload.mockRejectedValueOnce(new Error("up"))
    await store.getState().beginUpscaleInstall("u3")
    expect(notifyError).toHaveBeenCalled()
    host.ensureDownload.mockRejectedValueOnce("plain-up")
    await store.getState().beginUpscaleInstall("u4")
    expect(notifyError).toHaveBeenCalledWith(
      "plain-up",
      "Upscale install failed"
    )

    await store.getState().beginUsduInstall()
    await store.getState().beginPromptToolsInstall()
    host.ensureDownload.mockRejectedValueOnce(new Error("pt"))
    await store.getState().beginPromptToolsInstall("other")
    host.ensureDownload.mockRejectedValueOnce("plain-pt")
    await store.getState().beginPromptToolsInstall("other2")
    expect(notifyError).toHaveBeenCalled()

    store.setState({
      loraPacks: [{ id: "lora1", name: "Lora One" } as never],
    })
    await store.getState().beginLoraUninstall("lora1", "flux")
    expect(host.uninstallLoraVariant).toHaveBeenCalledWith("lora1", "flux")
    expect(notifySuccess).toHaveBeenCalledWith("Lora One", "Removed 1 file(s)")
    host.uninstallLoraVariant.mockResolvedValueOnce({ removed: 0, kept: 2 })
    await store.getState().beginLoraUninstall("missing", "flux")
    expect(notifySuccess).toHaveBeenCalledWith(
      "missing",
      "Removed 0 file(s); kept 2 shared"
    )
    host.uninstallLoraVariant.mockRejectedValueOnce(new Error("rm"))
    await store.getState().beginLoraUninstall("lora1", "flux")
    expect(notifyError).toHaveBeenCalledWith("rm", "LoRA uninstall failed")
  })
})
