"use client"

import { HardDriveIcon } from "lucide-react"
import { useEffect, useState } from "react"
import {
  GpuVendorDialog,
  vendorOptionsFromAdapters,
} from "@/components/gpu-vendor-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  isTauri,
  listSettings,
  openExternalUrl,
  runtimePinsStatus,
  setSetting,
  type GpuInfo,
  type GpuVendor,
  type NvidiaVariant,
  type RuntimeInstall,
  type RuntimePinsStatus,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
  SETTING_GPU_VENDOR,
  SETTING_NVIDIA_PORTABLE_OVERRIDE,
} from "@/components/studio/slices/helpers"

const VENDOR_LABEL: Record<GpuVendor, string> = {
  nvidia: "NVIDIA",
  amd: "AMD",
  intel: "Intel",
}

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBrowseModels: () => void
  comfy: RuntimeInstall | null | undefined
  comfyHealthy: boolean
  runtimeMessage: string | null
  runtimeBusy: boolean
  onInstallComfy: () => void
  onStartComfy: () => void
  onStopComfy: () => void
  hfToken: string
  onHfTokenChange: (value: string) => void
  hfTokenDirty: boolean
  hfTokenSaving: boolean
  onSaveHfToken: () => void
  civitaiToken: string
  onCivitaiTokenChange: (value: string) => void
  civitaiTokenDirty: boolean
  civitaiTokenSaving: boolean
  onSaveCivitaiToken: () => void
  gpu: GpuInfo | null
  onGpuVendorChanged?: () => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  onBrowseModels,
  comfy,
  comfyHealthy,
  runtimeMessage,
  runtimeBusy,
  onInstallComfy,
  onStartComfy,
  onStopComfy,
  hfToken,
  onHfTokenChange,
  hfTokenDirty,
  hfTokenSaving,
  onSaveHfToken,
  civitaiToken,
  onCivitaiTokenChange,
  civitaiTokenDirty,
  civitaiTokenSaving,
  onSaveCivitaiToken,
  gpu,
  onGpuVendorChanged,
}: SettingsDialogProps) {
  const [pins, setPins] = useState<RuntimePinsStatus | null>(null)
  const [savedVendor, setSavedVendor] = useState<GpuVendor | null>(null)
  const [nvidiaOverride, setNvidiaOverride] = useState<"" | NvidiaVariant>("")
  const [changeGpuOpen, setChangeGpuOpen] = useState(false)
  const [overrideBusy, setOverrideBusy] = useState(false)

  useEffect(() => {
    if (!open || !isTauri()) return
    let cancelled = false
    void runtimePinsStatus()
      .then((status) => {
        if (!cancelled) setPins(status)
      })
      .catch(() => {
        if (!cancelled) setPins(null)
      })
    void listSettings()
      .then((settings) => {
        if (cancelled) return
        const v = settings[SETTING_GPU_VENDOR]?.trim()
        setSavedVendor(
          v === "nvidia" || v === "amd" || v === "intel" ? v : null
        )
        const ov = settings[SETTING_NVIDIA_PORTABLE_OVERRIDE]?.trim()
        setNvidiaOverride(ov === "modern" || ov === "cu126" ? ov : "")
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, comfy?.version, comfy?.status, runtimeBusy])

  const vendorOptions = gpu ? vendorOptionsFromAdapters(gpu.adapters) : []
  const canChangeVendor = vendorOptions.length >= 2
  const activeVendor = savedVendor ?? gpu?.vendor ?? null
  const activeAdapter =
    (activeVendor && gpu?.adapters.find((a) => a.vendor === activeVendor)) ||
    gpu?.adapters[0] ||
    null
  const effectiveVariant =
    nvidiaOverride ||
    (activeVendor === "nvidia" ? gpu?.nvidiaVariant : null) ||
    null

  async function saveNvidiaOverride(next: "" | NvidiaVariant) {
    setOverrideBusy(true)
    try {
      await setSetting(SETTING_NVIDIA_PORTABLE_OVERRIDE, next)
      setNvidiaOverride(next)
      notifySuccess(
        next
          ? `NVIDIA portable override set to ${next}`
          : "NVIDIA portable override cleared"
      )
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    } finally {
      setOverrideBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Runtime and host preferences for this machine.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4 text-sm">
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
                    onClick={() => setChangeGpuOpen(true)}
                  >
                    Change GPU…
                  </Button>
                ) : null}
              </div>
              {activeVendor === "nvidia" ? (
                <label className="mt-3 flex flex-col gap-1.5 text-xs">
                  <span className="text-muted-foreground">
                    NVIDIA portable override
                  </span>
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    disabled={overrideBusy}
                    value={nvidiaOverride}
                    onChange={(e) => {
                      const v = e.target.value as "" | NvidiaVariant
                      void saveNvidiaOverride(v)
                    }}
                  >
                    <option value="">Auto (recommended)</option>
                    <option value="modern">Force modern (CUDA 13)</option>
                    <option value="cu126">Force cu126</option>
                  </select>
                  <span className="text-[11px] text-muted-foreground">
                    Changing vendor or portable may require Reinstall under
                    ComfyUI.
                  </span>
                </label>
              ) : null}
            </div>

            <div className="rounded-xl border p-4">
              <p className="font-medium">Models</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Shared weights library used by every blueprint.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={onBrowseModels}
              >
                <HardDriveIcon />
                Browse models
              </Button>
            </div>
            <div className="rounded-xl border p-4">
              <p className="font-medium">ComfyUI</p>
              <div className="mt-2 space-y-1 font-mono text-xs text-muted-foreground">
                <p>status: {comfy?.status ?? "-"}</p>
                <p>healthy: {comfyHealthy ? "yes" : "no"}</p>
                <p>port: {comfy?.port ?? "-"}</p>
                <p>
                  expected: {pins?.comfy.expected ?? "-"}
                  {pins && !pins.comfy.matches ? " · update pending" : ""}
                </p>
                <p>
                  installed: {pins?.comfy.installed ?? comfy?.version ?? "-"}
                </p>
                <p className="truncate">path: {comfy?.installPath || "-"}</p>
                {pins?.nodes.map((node) => (
                  <p key={node.id}>
                    {node.id}: {node.installed ?? "-"}
                    {node.matches ? "" : ` (app expects ${node.expected})`}
                  </p>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Engine and managed nodes are pinned by the app. Reinstall
                installs the pinned ComfyUI build; node pins apply on first use.
              </p>
              {runtimeMessage ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {runtimeMessage}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={runtimeBusy}
                  onClick={onInstallComfy}
                >
                  Reinstall
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    runtimeBusy ||
                    !comfy?.installPath ||
                    comfy.status === "installing" ||
                    comfy.status === "starting" ||
                    comfy.status === "running"
                  }
                  onClick={onStartComfy}
                >
                  Start
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    runtimeBusy ||
                    (comfy?.status !== "running" &&
                      comfy?.status !== "starting")
                  }
                  onClick={onStopComfy}
                >
                  Stop
                </Button>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <p className="font-medium">Hugging Face</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Access token for gated models (e.g. Black Forest Labs). Accept
                the model license on Hugging Face first, then paste a token with
                read access.
              </p>
              <label className="mt-3 flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">Access token</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="hf_…"
                  value={hfToken}
                  onChange={(e) => onHfTokenChange(e.target.value)}
                  className="font-mono text-xs"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={hfTokenSaving || !hfTokenDirty}
                  onClick={onSaveHfToken}
                >
                  {hfTokenSaving ? "Saving…" : "Save token"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    void openExternalUrl(
                      "https://huggingface.co/settings/tokens/new?preset=read-only"
                    ).catch((e) =>
                      notifyError(
                        e instanceof Error ? e.message : String(e),
                        "Could not open browser"
                      )
                    )
                  }}
                >
                  Get a token
                </button>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <p className="font-medium">CivitAI</p>
              <p className="mt-1 text-xs text-muted-foreground">
                API key for model downloads. On your account page, scroll to{" "}
                <span className="font-medium text-foreground">API Keys</span>,
                create a key, then paste it here.
              </p>
              <label className="mt-3 flex flex-col gap-1.5 text-xs">
                <span className="text-muted-foreground">API key</span>
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste API key…"
                  value={civitaiToken}
                  onChange={(e) => onCivitaiTokenChange(e.target.value)}
                  className="font-mono text-xs"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={civitaiTokenSaving || !civitaiTokenDirty}
                  onClick={onSaveCivitaiToken}
                >
                  {civitaiTokenSaving ? "Saving…" : "Save key"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    void openExternalUrl(
                      "https://civitai.com/user/account"
                    ).catch((e) =>
                      notifyError(
                        e instanceof Error ? e.message : String(e),
                        "Could not open browser"
                      )
                    )
                  }}
                >
                  Open account settings
                </button>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Close
            </DialogClose>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <GpuVendorDialog
        open={changeGpuOpen}
        dismissible
        onOpenChange={setChangeGpuOpen}
        options={vendorOptions}
        initialVendor={savedVendor ?? gpu?.vendor}
        onConfirm={async (vendor) => {
          await setSetting(SETTING_GPU_VENDOR, vendor)
          setSavedVendor(vendor)
          setChangeGpuOpen(false)
          notifySuccess(
            "GPU updated",
            "Downloading the matching ComfyUI portable…"
          )
          onGpuVendorChanged?.()
          // Replace the previous vendor's portable immediately.
          onInstallComfy()
        }}
      />
    </>
  )
}
