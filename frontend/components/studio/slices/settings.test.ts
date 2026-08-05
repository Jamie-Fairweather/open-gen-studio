import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  providerTokenStatus: vi.fn(async () => ({
    huggingface: false,
    civitai: false,
  })),
  setProviderToken: vi.fn(async () => {}),
  clearProviderToken: vi.fn(async () => {}),
  ensureDownload: vi.fn(async () => ({ status: "queued", jobId: "d1" })),
  uninstallBlueprint: vi.fn(async () => ({ removed: 2, kept: 1 })),
  getBlueprint: vi.fn(async () => ({
    models: [
      {
        gated: true,
        url: "https://huggingface.co/org/model/resolve/main/f.safetensors",
      },
      { gated: false, url: "https://example.com/x" },
      { gated: true, url: "" },
    ],
  })),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

import { notifyError, notifySuccess } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"

beforeEach(() => {
  vi.clearAllMocks()
  host.getBlueprint.mockImplementation(async () => ({
    models: [
      {
        gated: true,
        url: "https://huggingface.co/org/model/resolve/main/f.safetensors",
      },
      { gated: false, url: "https://example.com/x" },
      { gated: true, url: "" },
    ],
  }))
  host.providerTokenStatus.mockImplementation(async () => ({
    huggingface: false,
    civitai: false,
  }))
})

describe("createSettingsSlice", () => {
  it("token CRUD, gated install flow, and dialog confirms", async () => {
    const store = createTestStudioStore()
    const s = store.getState()

    s.setHasHfToken(true)
    s.setHfToken("t")
    s.setHfTokenDirty(true)
    s.setHfTokenDialogOpen(true)
    s.setGatedModelDialogOpen(true)
    s.setHasCivitaiToken(true)
    s.setCivitaiToken("c")
    s.setCivitaiTokenDirty(true)
    s.setCivitaiTokenDialogOpen(true)
    s.setPendingInstallId("bp1")
    s.setPendingLoraInstall({ id: "l", arch: "flux" })

    await s.refreshProviderTokenStatus()
    host.providerTokenStatus.mockRejectedValueOnce(new Error("st"))
    await s.refreshProviderTokenStatus()
    host.providerTokenStatus.mockRejectedValueOnce("plain-refresh")
    await s.refreshProviderTokenStatus()

    store.setState({ hfToken: "  " })
    await store.getState().handleSaveHfToken()
    expect(notifyError).toHaveBeenCalled()
    store.setState({ hfToken: "hf_x" })
    await store.getState().handleSaveHfToken()
    expect(notifySuccess).toHaveBeenCalled()
    host.setProviderToken.mockRejectedValueOnce(new Error("save"))
    store.setState({ hfToken: "hf_y" })
    await store.getState().handleSaveHfToken()
    host.setProviderToken.mockRejectedValueOnce("plain-save")
    store.setState({ hfToken: "hf_z" })
    await store.getState().handleSaveHfToken()

    await store.getState().handleClearHfToken()
    host.clearProviderToken.mockRejectedValueOnce(new Error("clr"))
    await store.getState().handleClearHfToken()
    host.clearProviderToken.mockRejectedValueOnce("plain-clr")
    await store.getState().handleClearHfToken()

    store.setState({ civitaiToken: "" })
    await store.getState().handleSaveCivitaiToken()
    store.setState({ civitaiToken: "civ" })
    await store.getState().handleSaveCivitaiToken()
    host.setProviderToken.mockRejectedValueOnce(new Error("cs"))
    store.setState({ civitaiToken: "civ2" })
    await store.getState().handleSaveCivitaiToken()
    host.setProviderToken.mockRejectedValueOnce("plain-csave")
    store.setState({ civitaiToken: "civ3" })
    await store.getState().handleSaveCivitaiToken()

    await store.getState().handleClearCivitaiToken()
    host.clearProviderToken.mockRejectedValueOnce(new Error("cc"))
    await store.getState().handleClearCivitaiToken()
    host.clearProviderToken.mockRejectedValueOnce("plain-cclr")
    await store.getState().handleClearCivitaiToken()

    await store.getState().requestBlueprintInstall("bp1")
    host.ensureDownload.mockRejectedValueOnce(new Error("inst"))
    await store.getState().requestBlueprintInstall("bp1")
    host.ensureDownload.mockRejectedValueOnce("plain-inst")
    await store.getState().requestBlueprintInstall("bp1")

    store.setState({
      blueprints: [
        {
          id: "bp1",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      hasHfToken: false,
    })
    host.providerTokenStatus.mockResolvedValue({
      huggingface: false,
      civitai: false,
    })
    await store.getState().handleInstallBlueprint("bp1")
    expect(store.getState().hfTokenDialogOpen).toBe(true)

    store.setState({
      blueprints: [
        {
          id: "bp2",
          requiresHfToken: false,
          requiresCivitaiToken: true,
        } as never,
      ],
      hasCivitaiToken: false,
      pendingInstallId: null,
    })
    await store.getState().handleInstallBlueprint("bp2")
    expect(store.getState().civitaiTokenDialogOpen).toBe(true)

    store.setState({
      blueprints: [
        {
          id: "civ-ok",
          requiresHfToken: false,
          requiresCivitaiToken: true,
        } as never,
      ],
      hasCivitaiToken: true,
      hasHfToken: true,
      gatedTermsAcked: true,
    })
    host.providerTokenStatus.mockResolvedValue({
      huggingface: true,
      civitai: true,
    })
    await store.getState().handleInstallBlueprint("civ-ok")

    host.getBlueprint.mockImplementation(async (id: string) => {
      if (id === "gated-hf") {
        return {
          models: [
            {
              gated: true,
              url: "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/x.safetensors",
            },
          ],
        }
      }
      if (id === "bp3-throw") throw new Error("gb")
      if (id === "bp-null-models") return { models: null }
      if (id === "bp-gated") {
        return {
          models: [
            {
              gated: false,
              url: "https://huggingface.co/a/b/resolve/main/x.safetensors",
            },
            { gated: true, url: undefined },
            { gated: true, url: "" },
            { gated: true, url: "https://example.com/not-hf" },
            {
              gated: true,
              url: "https://huggingface.co/foo/bar/resolve/main/model.safetensors",
            },
          ],
        }
      }
      return {
        models: [
          {
            gated: true,
            url: "https://huggingface.co/org/model/resolve/main/f.safetensors",
          },
          { gated: false, url: "https://example.com/x" },
          { gated: true, url: "" },
        ],
      }
    })
    host.providerTokenStatus.mockImplementation(async () => ({
      huggingface: true,
      civitai: false,
    }))

    store.setState({
      blueprints: [
        {
          id: "bp3",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: false,
    })
    await store.getState().handleInstallBlueprint("bp3")
    expect(store.getState().gatedModelDialogOpen).toBe(true)

    store.setState({
      blueprints: [
        {
          id: "gated-hf",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: false,
      gatedModelDialogOpen: false,
    })
    await store.getState().handleInstallBlueprint("gated-hf")
    expect(store.getState().gatedModelRepos.length).toBeGreaterThan(0)

    store.setState({
      blueprints: [
        {
          id: "bp3-throw",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      gatedTermsAcked: false,
      gatedModelDialogOpen: false,
    })
    await store.getState().handleInstallBlueprint("bp3-throw")

    store.setState({
      blueprints: [
        {
          id: "bp-null-models",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: false,
      gatedModelDialogOpen: false,
    })
    await store.getState().handleInstallBlueprint("bp-null-models")
    expect(store.getState().gatedModelRepos).toEqual([])

    store.setState({
      blueprints: [
        {
          id: "bp-gated",
          requiresHfToken: true,
          requiresCivitaiToken: false,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: false,
      gatedModelDialogOpen: false,
    })
    await store.getState().handleInstallBlueprint("bp-gated")
    expect(store.getState().gatedModelRepos).toEqual([
      expect.objectContaining({ id: "foo/bar" }),
    ])

    host.providerTokenStatus.mockRejectedValueOnce(new Error("tok"))
    await store.getState().handleInstallBlueprint("bp3")

    host.providerTokenStatus.mockRejectedValueOnce("plain-tok")
    await store.getState().handleInstallBlueprint("bp3")

    store.setState({
      blueprints: [{ id: "ok" } as never],
      hasHfToken: true,
      gatedTermsAcked: true,
    })
    host.providerTokenStatus.mockResolvedValue({
      huggingface: true,
      civitai: true,
    })
    await store.getState().handleInstallBlueprint("ok")

    store.setState({ pendingInstallId: null, gatedModelDialogOpen: true })
    await store.getState().handleGatedModelDialogConfirm()
    store.setState({
      pendingInstallId: "bp3",
      blueprints: [
        {
          id: "bp3",
          requiresHfToken: true,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: false,
    })
    await store.getState().handleGatedModelDialogConfirm()

    store.setState({
      pendingInstallId: "bp3",
      blueprints: [
        {
          id: "bp3",
          requiresHfToken: true,
        } as never,
      ],
      hasHfToken: true,
      gatedTermsAcked: true,
    })
    host.providerTokenStatus.mockResolvedValueOnce({
      huggingface: false,
      civitai: false,
    })
    await store.getState().handleGatedModelDialogConfirm()

    store.setState({
      pendingInstallId: "bp3",
      pendingLoraInstall: null,
      hasHfToken: true,
      gatedTermsAcked: true,
      blueprints: [{ id: "bp3", requiresHfToken: true } as never],
    })
    host.providerTokenStatus.mockResolvedValueOnce({
      huggingface: false,
      civitai: false,
    })
    await store.getState().handleHfTokenDialogConfirm("tok")

    store.setState({
      pendingInstallId: "bp3",
      pendingLoraInstall: null,
      hasHfToken: true,
      gatedTermsAcked: true,
      blueprints: [{ id: "bp3", requiresHfToken: true } as never],
    })
    await store.getState().handleHfTokenDialogConfirm("tok")

    store.setState({
      pendingInstallId: null,
      pendingLoraInstall: { id: "l1", arch: "flux" },
    })
    await store.getState().handleHfTokenDialogConfirm("tok")

    store.setState({
      pendingLoraInstall: { id: "l1", arch: "nope" as never },
    })
    await store.getState().handleHfTokenDialogConfirm("tok")

    store.setState({
      pendingInstallId: null,
      pendingLoraInstall: null,
    })
    await store.getState().handleHfTokenDialogConfirm("tok")

    store.setState({
      pendingInstallId: null,
      pendingLoraInstall: null,
    })
    await store.getState().handleCivitaiTokenDialogConfirm("civ-only")

    store.setState({
      pendingInstallId: "bpX",
      pendingLoraInstall: null,
      blueprints: [{ id: "bpX" } as never],
    })
    await store.getState().handleCivitaiTokenDialogConfirm("civ")

    store.setState({
      pendingLoraInstall: { id: "l2", arch: "flux" },
      pendingInstallId: null,
    })
    await store.getState().handleCivitaiTokenDialogConfirm("civ")

    store.setState({
      pendingLoraInstall: { id: "l2", arch: "bad" as never },
    })
    await store.getState().handleCivitaiTokenDialogConfirm("civ")

    store.setState({
      blueprints: [{ id: "bp1", name: "Flux" } as never],
    })
    await store.getState().handleUninstallBlueprint("bp1")
    expect(host.uninstallBlueprint).toHaveBeenCalledWith("bp1")
    expect(notifySuccess).toHaveBeenCalledWith(
      "Flux",
      "Removed 2 file(s); kept 1 shared"
    )
    host.uninstallBlueprint.mockResolvedValueOnce({ removed: 3, kept: 0 })
    await store.getState().handleUninstallBlueprint("missing")
    expect(notifySuccess).toHaveBeenCalledWith("missing", "Removed 3 file(s)")
    host.uninstallBlueprint.mockRejectedValueOnce(new Error("gone"))
    await store.getState().handleUninstallBlueprint("bp1")
    expect(notifyError).toHaveBeenCalledWith(
      "gone",
      "Blueprint uninstall failed"
    )
  })
})
