/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { GpuAdapter, GpuInfo } from "@/lib/host"
import { SettingsGpuCard } from "./settings-gpu-card"

vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    onValueChange?: (item: { value: string } | null) => void
    children?: React.ReactNode
  }) => (
    <div>
      <button type="button" role="combobox" aria-label="override">
        combobox
      </button>
      <button
        type="button"
        role="option"
        onClick={() =>
          onValueChange?.({ value: "auto", label: "Auto (recommended)" })
        }
      >
        Auto (recommended)
      </button>
      <button
        type="button"
        role="option"
        onClick={() =>
          onValueChange?.({ value: "modern", label: "Force modern (CUDA 13)" })
        }
      >
        Force modern (CUDA 13)
      </button>
      <button
        type="button"
        role="option"
        onClick={() =>
          onValueChange?.({ value: "cu126", label: "Force cu126" })
        }
      >
        Force cu126
      </button>
      <button type="button" onClick={() => onValueChange?.(null)}>
        mock-sel-null
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectPopup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

function gpu(partial: Partial<GpuInfo> & { adapters: GpuAdapter[] }): GpuInfo {
  return {
    available: true,
    name: "GPU",
    memoryTotal: "24 GB",
    driverVersion: "1",
    vendor: "nvidia",
    nvidiaVariant: "modern",
    needsVendorChoice: false,
    error: null,
    ...partial,
  }
}

const nvidiaAdapter: GpuAdapter = {
  vendor: "nvidia",
  name: "RTX",
  memoryTotal: "24 GB",
  driverVersion: "560",
  computeCap: null,
  cudaVersion: null,
}

const amdAdapter: GpuAdapter = {
  vendor: "amd",
  name: "RX",
  memoryTotal: null,
  driverVersion: null,
  computeCap: null,
  cudaVersion: null,
}

describe("SettingsGpuCard", () => {
  it("covers available/unavailable GPU branches and override select", async () => {
    const user = userEvent.setup()
    const onChangeGpu = vi.fn()
    const onSaveNvidiaOverride = vi.fn()

    const { rerender } = render(
      <SettingsGpuCard
        gpu={null}
        activeVendor={null}
        activeAdapter={null}
        effectiveVariant={null}
        nvidiaOverride=""
        canChangeVendor={false}
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByText("No supported GPU detected")).toBeInTheDocument()

    rerender(
      <SettingsGpuCard
        gpu={gpu({
          available: false,
          error: "GPU blew up",
          adapters: [],
          vendor: null,
        })}
        activeVendor={null}
        activeAdapter={null}
        effectiveVariant={null}
        nvidiaOverride=""
        canChangeVendor={false}
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByText("GPU blew up")).toBeInTheDocument()

    rerender(
      <SettingsGpuCard
        gpu={gpu({ adapters: [nvidiaAdapter], nvidiaVariant: "cu126" })}
        activeVendor="nvidia"
        activeAdapter={nvidiaAdapter}
        effectiveVariant="cu126"
        nvidiaOverride="cu126"
        canChangeVendor
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByText("NVIDIA")).toBeInTheDocument()
    expect(screen.getByText("VRAM: 24 GB")).toBeInTheDocument()
    expect(screen.getByText("Driver: 560")).toBeInTheDocument()
    expect(screen.getByText(/NVIDIA cu126/)).toBeInTheDocument()
    expect(screen.getByText(/\(override\)/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Change GPU/i }))
    expect(onChangeGpu).toHaveBeenCalled()

    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: /Auto/i }))
    expect(onSaveNvidiaOverride).toHaveBeenCalledWith("")

    await user.click(screen.getByRole("combobox"))
    await user.click(
      await screen.findByRole("option", { name: /Force modern/i })
    )
    expect(onSaveNvidiaOverride).toHaveBeenCalledWith("modern")

    rerender(
      <SettingsGpuCard
        gpu={gpu({
          adapters: [amdAdapter],
          vendor: "amd",
          nvidiaVariant: null,
        })}
        activeVendor="amd"
        activeAdapter={{
          ...amdAdapter,
          memoryTotal: null,
          driverVersion: null,
        }}
        effectiveVariant={null}
        nvidiaOverride=""
        canChangeVendor={false}
        overrideBusy
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByText(/Portable:/)).toBeInTheDocument()
    expect(screen.getAllByText("AMD").length).toBeGreaterThan(0)
    expect(screen.queryByText(/NVIDIA portable override/)).toBeNull()
    expect(screen.queryByText(/VRAM:/)).toBeNull()
    expect(screen.queryByText(/Driver:/)).toBeNull()

    rerender(
      <SettingsGpuCard
        gpu={gpu({ adapters: [nvidiaAdapter] })}
        activeVendor={null}
        activeAdapter={nvidiaAdapter}
        effectiveVariant="modern"
        nvidiaOverride=""
        canChangeVendor={false}
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByText("Unknown")).toBeInTheDocument()

    onSaveNvidiaOverride.mockClear()
    rerender(
      <SettingsGpuCard
        gpu={gpu({ adapters: [nvidiaAdapter] })}
        activeVendor="nvidia"
        activeAdapter={nvidiaAdapter}
        effectiveVariant="modern"
        nvidiaOverride=""
        canChangeVendor={false}
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    await user.click(screen.getByText("mock-sel-null"))
    expect(onSaveNvidiaOverride).not.toHaveBeenCalled()

    rerender(
      <SettingsGpuCard
        gpu={gpu({ adapters: [nvidiaAdapter] })}
        activeVendor="nvidia"
        activeAdapter={nvidiaAdapter}
        effectiveVariant="modern"
        nvidiaOverride={"bogus" as "" | "modern" | "cu126"}
        canChangeVendor={false}
        overrideBusy={false}
        onChangeGpu={onChangeGpu}
        onSaveNvidiaOverride={onSaveNvidiaOverride}
      />
    )
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })
})
