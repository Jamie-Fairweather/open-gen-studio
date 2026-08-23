"use client"

import { CpuIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import type { GpuAdapter, GpuVendor } from "@/lib/host"
import { cn } from "@/lib/utils"

const VENDOR_LABEL: Record<GpuVendor, string> = {
  nvidia: "NVIDIA",
  amd: "AMD",
  intel: "Intel",
}

/** One GPU vendor choice: the vendor id and a representative adapter. */
export type GpuVendorOption = {
  vendor: GpuVendor
  adapter: GpuAdapter
}

type GpuVendorDialogProps = {
  open: boolean
  /** First-run cannot dismiss without a choice. */
  dismissible?: boolean
  onOpenChange: (open: boolean) => void
  options: GpuVendorOption[]
  initialVendor?: GpuVendor | null
  onConfirm: (vendor: GpuVendor) => Promise<void>
}

/** Parse strings like `16376 MiB` / `16 GB` → MiB for sorting. */
export function parseMemoryMib(memoryTotal: string | null | undefined): number {
  if (!memoryTotal) return 0
  const match = memoryTotal.trim().match(/^([\d.]+)\s*(mi?b|gi?b|ti?b)?/i)
  if (!match) return 0
  const n = Number(match[1])
  if (!Number.isFinite(n)) return 0
  const unit = (match[2] ?? "mib").toLowerCase()
  if (unit.startsWith("t")) return n * 1024 * 1024
  if (unit.startsWith("g")) return n * 1024
  return n
}

/** First-run (or Settings) pick among GPU vendors on a multi-vendor PC. */
export function GpuVendorDialog({
  open,
  dismissible = false,
  onOpenChange,
  options,
  initialVendor,
  onConfirm,
}: GpuVendorDialogProps) {
  const recommended = options[0]?.vendor ?? null
  const [selected, setSelected] = useState<GpuVendor | null>(
    () =>
      (initialVendor && options.some((o) => o.vendor === initialVendor)
        ? initialVendor
        : null) ?? recommended
  )
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    try {
      await onConfirm(selected!)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return
        onOpenChange(next)
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CpuIcon className="size-5 text-primary" />
            Choose your GPU
          </DialogTitle>
          <DialogDescription>
            This PC has more than one GPU vendor. Pick which one Open Gen Studio
            should use for the ComfyUI runtime. You can change this later in
            Settings.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-2">
          {options.map(({ vendor, adapter }, index) => {
            const active = selected === vendor
            const isRecommended = index === 0
            return (
              <button
                key={vendor}
                type="button"
                disabled={busy}
                onClick={() => setSelected(vendor)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium">{VENDOR_LABEL[vendor]}</span>
                  {isRecommended ? (
                    <span className="text-[10px] font-medium tracking-wide text-primary uppercase">
                      Recommended
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {adapter.name}
                  {adapter.memoryTotal ? ` · ${adapter.memoryTotal}` : ""}
                </span>
              </button>
            )
          })}
        </DialogPanel>
        <DialogFooter>
          {dismissible ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!selected || busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? "Saving…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}

/** One representative adapter per vendor (highest VRAM), sorted by VRAM desc. */
export function vendorOptionsFromAdapters(
  adapters: GpuAdapter[]
): GpuVendorOption[] {
  const bestByVendor = new Map<GpuVendor, GpuAdapter>()
  for (const adapter of adapters) {
    const prev = bestByVendor.get(adapter.vendor)
    if (
      !prev ||
      parseMemoryMib(adapter.memoryTotal) > parseMemoryMib(prev.memoryTotal)
    ) {
      bestByVendor.set(adapter.vendor, adapter)
    }
  }
  return [...bestByVendor.entries()]
    .map(([vendor, adapter]) => ({ vendor, adapter }))
    .toSorted(
      (a, b) =>
        parseMemoryMib(b.adapter.memoryTotal) -
        parseMemoryMib(a.adapter.memoryTotal)
    )
}
