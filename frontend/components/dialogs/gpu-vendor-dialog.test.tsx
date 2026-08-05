/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { GpuAdapter } from "@/lib/host"
import {
  GpuVendorDialog,
  parseMemoryMib,
  vendorOptionsFromAdapters,
} from "./gpu-vendor-dialog"

function adapter(
  vendor: GpuAdapter["vendor"],
  memoryTotal: string | null,
  name = `${vendor}-gpu`
): GpuAdapter {
  return {
    vendor,
    name,
    memoryTotal,
    driverVersion: null,
    computeCap: null,
    cudaVersion: null,
  }
}

describe("parseMemoryMib", () => {
  it("parses units and rejects junk", () => {
    expect(parseMemoryMib(null)).toBe(0)
    expect(parseMemoryMib(undefined)).toBe(0)
    expect(parseMemoryMib("")).toBe(0)
    expect(parseMemoryMib("nope")).toBe(0)
    expect(parseMemoryMib("Infinity MiB")).toBe(0)
    expect(parseMemoryMib("16")).toBe(16)
    expect(parseMemoryMib("16 MiB")).toBe(16)
    expect(parseMemoryMib("16 GB")).toBe(16 * 1024)
    expect(parseMemoryMib("1 TiB")).toBe(1024 * 1024)
    expect(parseMemoryMib(" 8.5 GiB ")).toBe(8.5 * 1024)
    expect(parseMemoryMib("512 KiB")).toBe(512)
    expect(parseMemoryMib("NaN MiB")).toBe(0)
  })
})

describe("vendorOptionsFromAdapters", () => {
  it("keeps best VRAM per vendor and sorts desc", () => {
    const opts = vendorOptionsFromAdapters([
      adapter("amd", "8 GB", "AMD small"),
      adapter("nvidia", "12 GB", "NV mid"),
      adapter("nvidia", "24 GB", "NV big"),
      adapter("intel", "4 GB", "Intel"),
    ])
    expect(opts.map((o) => o.vendor)).toEqual(["nvidia", "amd", "intel"])
    expect(opts[0]?.adapter.name).toBe("NV big")
  })
})

describe("GpuVendorDialog", () => {
  it("selects vendor, confirms, and respects dismissible", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    const onOpenChange = vi.fn()
    const options = [
      { vendor: "nvidia" as const, adapter: adapter("nvidia", "24 GB") },
      { vendor: "amd" as const, adapter: adapter("amd", "16 GB") },
    ]

    const { rerender } = render(
      <GpuVendorDialog
        open
        onOpenChange={onOpenChange}
        options={options}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText("Recommended")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull()

    // non-dismissible: Escape must not propagate close
    onOpenChange.mockClear()
    await user.keyboard("{Escape}")
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /AMD/i }))
    let resolve!: () => void
    onConfirm.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r
        })
    )
    await user.click(screen.getByRole("button", { name: "Continue" }))
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
    resolve()
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("amd"))

    rerender(
      <GpuVendorDialog
        open
        dismissible
        onOpenChange={onOpenChange}
        options={options}
        initialVendor="amd"
        onConfirm={onConfirm}
      />
    )
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    // dismissible close via Dialog (X / Escape) hits the guarded onOpenChange path
    onOpenChange.mockClear()
    rerender(
      <GpuVendorDialog
        open
        dismissible
        onOpenChange={onOpenChange}
        options={options}
        onConfirm={onConfirm}
      />
    )
    await user.keyboard("{Escape}")
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))

    rerender(
      <GpuVendorDialog
        open
        onOpenChange={onOpenChange}
        options={[{ vendor: "intel", adapter: adapter("intel", null) }]}
        initialVendor="nvidia"
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText("Intel")).toBeInTheDocument()
    expect(screen.queryByText(/ · /)).toBeNull()
  })

  it("no-ops confirm when nothing is selected", async () => {
    const onConfirm = vi.fn(async () => {})
    render(
      <GpuVendorDialog
        open
        onOpenChange={() => {}}
        options={[]}
        onConfirm={onConfirm}
      />
    )
    const continueBtn = screen.getByRole("button", { name: "Continue" })
    expect(continueBtn).toBeDisabled()
    fireEvent.click(continueBtn)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
