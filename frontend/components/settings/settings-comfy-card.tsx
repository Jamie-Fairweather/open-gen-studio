"use client"

import { Button } from "@/components/ui/button"
import type { RuntimeInstall, RuntimePinsStatus } from "@/lib/host"

export type SettingsComfyCardProps = {
  comfy: RuntimeInstall | null | undefined
  comfyHealthy: boolean
  runtimeMessage: string | null
  runtimeBusy: boolean
  pins: RuntimePinsStatus | null
  onInstallComfy: () => void
  onStartComfy: () => void
  onStopComfy: () => void
}

export function SettingsComfyCard({
  comfy,
  comfyHealthy,
  runtimeMessage,
  runtimeBusy,
  pins,
  onInstallComfy,
  onStartComfy,
  onStopComfy,
}: SettingsComfyCardProps) {
  return (
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
        <p>installed: {pins?.comfy.installed ?? comfy?.version ?? "-"}</p>
        <p className="truncate">path: {comfy?.installPath || "-"}</p>
        {pins?.nodes.map((node) => (
          <p key={node.id}>
            {node.id}: {node.installed ?? "-"}
            {node.matches ? "" : ` (app expects ${node.expected})`}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Engine and managed nodes are pinned by the app. Reinstall installs the
        pinned ComfyUI build; node pins apply on first use.
      </p>
      {runtimeMessage ? (
        <p className="mt-2 text-xs text-muted-foreground">{runtimeMessage}</p>
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
  )
}
