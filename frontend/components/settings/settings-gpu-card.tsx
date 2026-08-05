"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GpuInfo, GpuVendor, NvidiaVariant } from "@/lib/host"

const VENDOR_LABEL: Record<GpuVendor, string> = {
  nvidia: "NVIDIA",
  amd: "AMD",
  intel: "Intel",
}

type NvidiaOverrideItem = {
  value: "auto" | NvidiaVariant
  label: string
}

const NVIDIA_OVERRIDE_ITEMS: NvidiaOverrideItem[] = [
  { value: "auto", label: "Auto (recommended)" },
  { value: "modern", label: "Force modern (CUDA 13)" },
  { value: "cu126", label: "Force cu126" },
]

function nvidiaOverrideItem(value: "" | NvidiaVariant): NvidiaOverrideItem {
  return (
    NVIDIA_OVERRIDE_ITEMS.find((item) => item.value === (value || "auto")) ??
    NVIDIA_OVERRIDE_ITEMS[0]
  )
}

export type SettingsGpuCardProps = {
  gpu: GpuInfo | null
  activeVendor: GpuVendor | null
  activeAdapter: GpuInfo["adapters"][number] | null
  effectiveVariant: NvidiaVariant | null
  nvidiaOverride: "" | NvidiaVariant
  canChangeVendor: boolean
  overrideBusy: boolean
  onChangeGpu: () => void
  onSaveNvidiaOverride: (next: "" | NvidiaVariant) => void
}

export function SettingsGpuCard({
  gpu,
  activeVendor,
  activeAdapter,
  effectiveVariant,
  nvidiaOverride,
  canChangeVendor,
  overrideBusy,
  onChangeGpu,
  onSaveNvidiaOverride,
}: SettingsGpuCardProps) {
  return (
    <div className="rounded-xl border p-4">
      <p className="font-medium">GPU</p>
      {gpu?.available && activeAdapter ? (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>
            Vendor:{" "}
            <span className="text-foreground">
              {activeVendor ? VENDOR_LABEL[activeVendor] : "Unknown"}
            </span>
          </p>
          <p className="text-foreground">{activeAdapter.name}</p>
          {activeAdapter.memoryTotal ? (
            <p>VRAM: {activeAdapter.memoryTotal}</p>
          ) : null}
          {activeAdapter.driverVersion ? (
            <p>Driver: {activeAdapter.driverVersion}</p>
          ) : null}
          {activeVendor === "nvidia" ? (
            <p>
              Portable:{" "}
              <span className="text-foreground">
                {effectiveVariant === "cu126"
                  ? "NVIDIA cu126"
                  : "NVIDIA modern"}
              </span>
              {nvidiaOverride ? " (override)" : ""}
            </p>
          ) : activeVendor ? (
            <p>
              Portable:{" "}
              <span className="text-foreground">
                {VENDOR_LABEL[activeVendor]}
              </span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {gpu?.error ?? "No supported GPU detected"}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canChangeVendor ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onChangeGpu}
          >
            Change GPU…
          </Button>
        ) : null}
      </div>
      {activeVendor === "nvidia" ? (
        <div className="mt-3 flex flex-col gap-1.5 text-xs">
          <span className="text-muted-foreground">
            NVIDIA portable override
          </span>
          <Select
            items={NVIDIA_OVERRIDE_ITEMS}
            value={nvidiaOverrideItem(nvidiaOverride)}
            onValueChange={(item) => {
              if (!item) return
              onSaveNvidiaOverride(item.value === "auto" ? "" : item.value)
            }}
            disabled={overrideBusy}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {NVIDIA_OVERRIDE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <span className="text-[11px] text-muted-foreground">
            Changing vendor or portable may require Reinstall under ComfyUI.
          </span>
        </div>
      ) : null}
    </div>
  )
}
