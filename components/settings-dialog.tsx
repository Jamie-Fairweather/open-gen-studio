"use client"

import { HardDriveIcon } from "lucide-react"
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
import { openExternalUrl, type GpuInfo, type RuntimeInstall } from "@/lib/host"
import { notifyError } from "@/lib/notify"

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
}: SettingsDialogProps) {
  return (
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
              <p>status: {comfy?.status ?? "—"}</p>
              <p>healthy: {comfyHealthy ? "yes" : "no"}</p>
              <p>port: {comfy?.port ?? "—"}</p>
              <p className="truncate">path: {comfy?.installPath || "—"}</p>
            </div>
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
                  (comfy?.status !== "running" && comfy?.status !== "starting")
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
              Access token for gated models (e.g. Black Forest Labs). Accept the
              model license on Hugging Face first, then paste a token with read
              access.
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

          {gpu ? (
            <p className="text-xs text-muted-foreground">
              {gpu.available
                ? `${gpu.name} · ${gpu.memoryTotal} · driver ${gpu.driverVersion}`
                : (gpu.error ?? "No NVIDIA GPU detected")}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
