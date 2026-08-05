/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { state, setSetting, notifySuccess, selectActiveDetail } = vi.hoisted(
  () => {
    const state: Record<string, unknown> = {}
    return {
      state,
      setSetting: vi.fn(async () => {}),
      notifySuccess: vi.fn(),
      selectActiveDetail: {
        current: { arch: "z-image" } as { arch: string } | null,
      },
    }
  }
)

vi.mock("@/lib/host", () => ({
  setSetting: (...a: unknown[]) => setSetting(...a),
}))
vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}))
vi.mock("@/lib/arch", () => ({
  isRecipeArch: (a: string) => a === "z-image",
}))
vi.mock("./store", () => ({
  useStudioStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel(state),
    { getState: () => state }
  ),
  useStudioSelector: (sel: (s: Record<string, unknown>) => unknown) =>
    sel(state),
}))
vi.mock("./selectors", () => ({
  selectActiveArch: () => "z-image",
  selectActiveDetail: () => selectActiveDetail.current,
  selectActiveLoraStack: () => [{ id: "lora1", strength: 0.8 }],
  selectActiveSelectedId: () => "bp1",
  selectInstallingId: () => null,
  selectInstallQueue: () => [],
  selectLoraInstallingKey: () => null,
  selectLoraQueuedKeys: () => [],
  selectTabBlueprints: () => [{ id: "bp1", name: "BP" }],
}))
vi.mock("./slices/helpers", () => ({
  SETTING_GPU_VENDOR: "gpu_vendor",
}))
vi.mock("@/components/job-queue-chrome", () => ({
  JobQueueExpandDialog: () => <div>job-expand</div>,
}))
vi.mock("@/components/libraries", () => ({
  BlueprintPickerDialog: (p: { onInstall: (id: string) => void }) => (
    <button type="button" onClick={() => p.onInstall("bp1")}>
      bp-install
    </button>
  ),
  LoraPickerDialog: (p: {
    onSelect: (id: string) => void
    onInstall: (id: string, arch: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => p.onSelect("missing")}>
        lora-miss
      </button>
      <button type="button" onClick={() => p.onSelect("lora1")}>
        lora-sel
      </button>
      <button type="button" onClick={() => p.onSelect("lora-no-default")}>
        lora-no-default
      </button>
      <button type="button" onClick={() => p.onInstall("lora1", "z-image")}>
        lora-inst
      </button>
      <button type="button" onClick={() => p.onInstall("lora1", "bad")}>
        lora-bad
      </button>
    </div>
  ),
  ModelsLibraryDialog: (p: {
    onInstallLora: (id: string, arch: string) => void
    onInstallUpscaler: (id: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => p.onInstallLora("l", "z-image")}>
        mod-lora
      </button>
      <button type="button" onClick={() => p.onInstallLora("l", "bad")}>
        mod-lora-bad
      </button>
      <button type="button" onClick={() => p.onInstallUpscaler("u1")}>
        mod-up
      </button>
    </div>
  ),
}))
vi.mock("@/components/dialogs", () => ({
  GatedModelDialog: (p: {
    onOpenChange: (o: boolean) => void
    blueprintName?: string | null
  }) => (
    <div>
      <span>{p.blueprintName ?? "no-name"}</span>
      <button type="button" onClick={() => p.onOpenChange(false)}>
        gated-close
      </button>
    </div>
  ),
  HfTokenDialog: (p: {
    onOpenChange: (o: boolean) => void
    blueprintName?: string | null
  }) => (
    <div>
      <span>{p.blueprintName ?? "no-name"}</span>
      <button type="button" onClick={() => p.onOpenChange(false)}>
        hf-close
      </button>
      <button type="button" onClick={() => p.onOpenChange(true)}>
        hf-open
      </button>
    </div>
  ),
  CivitaiTokenDialog: (p: {
    onOpenChange: (o: boolean) => void
    blueprintName?: string | null
  }) => (
    <div>
      <span>{p.blueprintName ?? "no-name"}</span>
      <button type="button" onClick={() => p.onOpenChange(false)}>
        civ-close
      </button>
      <button type="button" onClick={() => p.onOpenChange(true)}>
        civ-open
      </button>
    </div>
  ),
  GpuVendorDialog: (p: { onConfirm: (v: string) => void | Promise<void> }) => (
    <button type="button" onClick={() => void p.onConfirm("nvidia")}>
      gpu-ok
    </button>
  ),
  vendorOptionsFromAdapters: () => [{ value: "nvidia", label: "NVIDIA" }],
}))

import { StudioDialogs } from "./studio-dialogs"

function resetState(extra: Record<string, unknown> = {}) {
  const bag = { stack: [] as { id: string; strength: number }[] }
  Object.assign(state, {
    pickerOpen: true,
    loraPickerOpen: true,
    modelsOpen: true,
    loraPacks: [
      { id: "lora1", name: "L", defaultStrength: 0.8 },
      { id: "lora-no-default", name: "ND" },
    ],
    loraStack: bag.stack,
    setLoraStack: (fn: unknown) => {
      bag.stack =
        typeof fn === "function"
          ? (fn as (p: typeof bag.stack) => typeof bag.stack)(bag.stack)
          : (fn as typeof bag.stack)
      state.loraStack = bag.stack
    },
    beginLoraInstall: vi.fn(async () => {}),
    beginUpscaleInstall: vi.fn(async () => {}),
    handleInstallBlueprint: vi.fn(async () => {}),
    selectBlueprint: vi.fn(),
    gatedModelDialogOpen: true,
    hfTokenDialogOpen: false,
    civitaiTokenDialogOpen: false,
    pendingInstallId: "bp1",
    blueprints: [
      {
        id: "bp1",
        name: "BP",
        source: "official",
        modelCount: 1,
        modelsReady: 1,
      },
    ],
    gatedTermsAcked: false,
    setGatedModelDialogOpen: vi.fn(),
    setHfTokenDialogOpen: vi.fn(),
    setCivitaiTokenDialogOpen: vi.fn(),
    setPendingInstallId: vi.fn(),
    handleGatedModelDialogConfirm: vi.fn(),
    handleHfTokenDialogConfirm: vi.fn(),
    handleCivitaiTokenDialogConfirm: vi.fn(),
    gpu: { adapters: [{ vendor: "nvidia" }] },
    runtimes: [
      {
        engine: "comfyui",
        status: "ready",
        installPath: "C:/comfy",
      },
    ],
    gpuVendorDialogOpen: true,
    setGpuVendorDialogOpen: vi.fn(),
    handleInstallComfy: vi.fn(async () => {}),
    setPickerOpen: vi.fn(),
    setLoraPickerOpen: vi.fn(),
    setModelsOpen: vi.fn(),
    sizesProbing: false,
    gatedModelRepos: [],
    ...extra,
  })
}

describe("StudioDialogs", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    selectActiveDetail.current = { arch: "z-image" }
    resetState()
  })

  it("invokes dialog callbacks", async () => {
    const { unmount } = render(<StudioDialogs />)
    await userEvent.click(screen.getByText("bp-install"))
    expect(state.handleInstallBlueprint).toHaveBeenCalled()

    await userEvent.click(screen.getByText("lora-miss"))
    await userEvent.click(screen.getByText("lora-sel"))
    expect(
      (state.loraStack as { id: string }[]).some((e) => e.id === "lora1")
    ).toBe(true)
    await userEvent.click(screen.getByText("lora-sel"))
    await userEvent.click(screen.getByText("lora-no-default"))
    expect(
      (state.loraStack as { id: string; strength: number }[]).find(
        (e) => e.id === "lora-no-default"
      )?.strength
    ).toBe(1)
    await userEvent.click(screen.getByText("lora-inst"))
    await userEvent.click(screen.getByText("lora-bad"))
    await userEvent.click(screen.getByText("mod-lora"))
    await userEvent.click(screen.getByText("mod-lora-bad"))
    await userEvent.click(screen.getByText("mod-up"))

    await userEvent.click(screen.getByText("gated-close"))
    expect(state.setPendingInstallId).toHaveBeenCalledWith(null)

    unmount()
    resetState({
      hfTokenDialogOpen: true,
      civitaiTokenDialogOpen: false,
      setHfTokenDialogOpen: vi.fn(),
      setPendingInstallId: vi.fn(),
    })
    const r2 = render(<StudioDialogs />)
    await userEvent.click(screen.getByText("hf-close"))
    r2.unmount()

    resetState({
      civitaiTokenDialogOpen: true,
      setCivitaiTokenDialogOpen: vi.fn(),
      setPendingInstallId: vi.fn(),
    })
    render(<StudioDialogs />)
    await userEvent.click(screen.getByText("civ-close"))
    await userEvent.click(screen.getByText("gpu-ok"))
    expect(setSetting).toHaveBeenCalled()
    expect(notifySuccess).toHaveBeenCalled()
  })

  it("covers dialog key branches and gpu-null paths", async () => {
    selectActiveDetail.current = null
    resetState({ gpu: null, gpuVendorDialogOpen: false })
    const r0 = render(<StudioDialogs />)
    r0.unmount()

    resetState({
      pendingInstallId: null,
      gatedModelDialogOpen: false,
      hfTokenDialogOpen: false,
      civitaiTokenDialogOpen: false,
    })
    const rClosed = render(<StudioDialogs />)
    rClosed.unmount()

    resetState({
      pendingInstallId: "missing-bp",
      gatedModelDialogOpen: true,
      blueprints: [{ id: "bp1", name: "BP" }],
    })
    const rMissing = render(<StudioDialogs />)
    expect(rMissing.getAllByText("no-name").length).toBeGreaterThan(0)
    rMissing.unmount()

    resetState({
      gatedModelDialogOpen: true,
      hfTokenDialogOpen: false,
      civitaiTokenDialogOpen: false,
      pendingInstallId: null,
    })
    const rNullPending = render(<StudioDialogs />)
    rNullPending.unmount()

    resetState({
      gatedModelDialogOpen: true,
      hfTokenDialogOpen: false,
      civitaiTokenDialogOpen: false,
      pendingInstallId: "bp1",
      gatedTermsAcked: true,
    })
    const rGated = render(<StudioDialogs />)
    await userEvent.click(rGated.getByText("gated-close"))
    expect(state.setPendingInstallId).not.toHaveBeenCalled()
    rGated.unmount()

    resetState({
      gatedModelDialogOpen: true,
      hfTokenDialogOpen: true,
      pendingInstallId: "bp1",
      gatedTermsAcked: false,
    })
    const rGated2 = render(<StudioDialogs />)
    await userEvent.click(rGated2.getByText("gated-close"))
    expect(state.setPendingInstallId).not.toHaveBeenCalled()
    rGated2.unmount()

    cleanup()
    resetState({
      hfTokenDialogOpen: true,
      civitaiTokenDialogOpen: false,
      pendingInstallId: null,
    })
    const rHfNull = render(<StudioDialogs />)
    rHfNull.unmount()

    cleanup()
    resetState({
      hfTokenDialogOpen: true,
      civitaiTokenDialogOpen: true,
      pendingInstallId: "bp1",
      setPendingInstallId: vi.fn(),
    })
    const rHf = render(<StudioDialogs />)
    await userEvent.click(rHf.getByText("hf-close"))
    expect(state.setPendingInstallId).not.toHaveBeenCalled()
    await userEvent.click(rHf.getByText("hf-open"))
    rHf.unmount()

    cleanup()
    resetState({
      civitaiTokenDialogOpen: true,
      pendingInstallId: null,
    })
    const rCivNull = render(<StudioDialogs />)
    rCivNull.unmount()

    cleanup()
    resetState({
      civitaiTokenDialogOpen: true,
      pendingInstallId: "bp1",
      setPendingInstallId: vi.fn(),
    })
    const rCiv = render(<StudioDialogs />)
    await userEvent.click(rCiv.getByText("civ-open"))
    await userEvent.click(rCiv.getByText("civ-close"))
    expect(state.setPendingInstallId).toHaveBeenCalledWith(null)
  })
})
