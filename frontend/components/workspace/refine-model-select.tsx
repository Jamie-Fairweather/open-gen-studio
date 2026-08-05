"use client"

import { useMemo } from "react"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { UpscaleModelInfo } from "@/lib/host"
import { RefineInstallButton } from "./refine-install-button"

export type RefineModelSelectProps = {
  models: UpscaleModelInfo[]
  selected: UpscaleModelInfo | undefined
  installingId: string | null
  queuedIds: string[]
  pendingIds: string[]
  modelInstalling: boolean
  modelQueued: boolean
  modelBusy: boolean
  disabled?: boolean
  onModelIdChange: (id: string) => void
  onInstallModel: (id: string) => void
  width?: number
  height?: number
  outW: number | null
  outH: number | null
  isSupir: boolean
  usduEnabled: boolean
  effectiveScale: number
}

export function RefineModelSelect({
  models,
  selected,
  installingId,
  queuedIds,
  pendingIds,
  modelInstalling,
  modelQueued,
  modelBusy,
  disabled,
  onModelIdChange,
  onInstallModel,
  width,
  height,
  outW,
  outH,
  isSupir,
  usduEnabled,
  effectiveScale,
}: RefineModelSelectProps) {
  const selectItems = useMemo(
    () =>
      models.map((m) => {
        const tag =
          m.kind === "supir"
            ? "SUPIR"
            : m.name.startsWith("4x Nomos")
              ? "Nomos"
              : null
        const base = tag ? `${m.name} (${tag})` : m.name
        const downloading =
          installingId === m.id ||
          (pendingIds.includes(m.id) && !queuedIds.includes(m.id))
        const queued = queuedIds.includes(m.id) && installingId !== m.id
        const status = m.ready
          ? null
          : downloading
            ? "downloading"
            : queued
              ? "queued"
              : "needs download"
        return {
          value: m.id,
          label: status ? `${base} · ${status}` : base,
        }
      }),
    [models, installingId, queuedIds, pendingIds]
  )
  const selectValue =
    selectItems.find((i) => i.value === selected?.id) ?? selectItems[0] ?? null

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">Upscale model</span>
        <div className="flex items-center gap-1.5">
          <Select
            items={selectItems}
            value={selectValue}
            onValueChange={(item) => {
              if (item) onModelIdChange(item.value)
            }}
            disabled={disabled || models.length === 0}
          >
            <SelectTrigger size="sm" className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {selectItems.map((item) => (
                <SelectItem key={item.value} value={item}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {selected && !selected.ready ? (
            <RefineInstallButton
              installing={modelInstalling}
              queued={modelQueued}
              busy={modelBusy}
              disabled={disabled}
              downloadLabel={`Download ${selected.name}`}
              downloadAriaLabel={`Download ${selected.name}`}
              queuedAriaLabel={`${selected.name} queued`}
              installingAriaLabel={`Downloading ${selected.name}`}
              onInstall={() => onInstallModel(selected.id)}
            />
          ) : null}
        </div>
        {selected?.description ? (
          <span className="text-[10px] text-muted-foreground">
            {selected.description}
          </span>
        ) : null}
      </label>

      {outW && outH && width && height ? (
        <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
          {width}×{height} → {outW}×{outH}
          {isSupir
            ? ` · SUPIR ${effectiveScale}×`
            : usduEnabled
              ? ` · USDU ${effectiveScale}×`
              : ` · SR ${effectiveScale}×`}
        </p>
      ) : null}
    </>
  )
}
