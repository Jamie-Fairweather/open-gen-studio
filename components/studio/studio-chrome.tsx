"use client"

import { LayersIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { BlueprintPickerDialog } from "@/components/blueprint-picker-dialog"
import { CivitaiTokenDialog } from "@/components/civitai-token-dialog"
import { HfTokenDialog } from "@/components/hf-token-dialog"
import { LoraPickerDialog } from "@/components/lora-picker-dialog"
import { ModelsLibraryDialog } from "@/components/models-library-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { useStudio } from "@/components/studio/studio-provider"
import { STUDIO_TABS } from "@/components/studio/studio-tabs"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

export function StudioChrome({ children }: { children: ReactNode }) {
  const s = useStudio()

  if (!s.desktop) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open Gen AI
        </h1>
        <p className="text-sm text-muted-foreground">
          Local store and host APIs run inside the Tauri desktop shell. Start
          with <code className="font-mono text-xs">bun run desktop</code>.
        </p>
      </div>
    )
  }

  const downloading =
    s.downloadSnapshot.active != null || s.downloadSnapshot.queued.length > 0

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-3">
        <header className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-card/90 px-2 py-1 shadow-lg shadow-black/30 backdrop-blur-md sm:gap-3 sm:px-3">
          <div className="flex shrink-0 items-center gap-2 pl-1 text-sm font-medium">
            <LayersIcon className="size-4 text-primary" />
            <span className="hidden sm:inline">Open Gen AI</span>
          </div>
          <nav className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto text-sm [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {STUDIO_TABS.map((tab) => {
              const active = s.studioTab === tab.id
              const showDot = tab.id === "downloads" && downloading
              return (
                <Link
                  key={tab.id}
                  href={`/${tab.id}`}
                  className={cn(
                    "relative shrink-0 px-2.5 py-1.5 transition-colors sm:px-3",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {tab.label}
                    {showDot ? (
                      <span
                        className="size-1.5 rounded-full bg-primary"
                        aria-label="Download in progress"
                      />
                    ) : null}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-primary sm:inset-x-3" />
                  ) : null}
                </Link>
              )
            })}
          </nav>
          <WithTooltip label="Settings">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0 rounded-full"
              aria-label="Settings"
              onClick={() => s.setSettingsOpen(true)}
            >
              <SettingsIcon />
            </Button>
          </WithTooltip>
        </header>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>

      <BlueprintPickerDialog
        open={s.pickerOpen}
        onOpenChange={s.setPickerOpen}
        blueprints={s.tabBlueprints}
        selectedId={s.activeSelectedId}
        installingId={s.installingId}
        queuedIds={s.installQueue}
        sizesProbing={s.sizesProbing}
        onSelect={s.selectBlueprint}
        onInstall={(id) => void s.handleInstallBlueprint(id)}
        onEdit={s.openCreatorEdit}
      />

      <LoraPickerDialog
        open={s.loraPickerOpen}
        onOpenChange={s.setLoraPickerOpen}
        packs={s.loraPacks}
        arch={s.activeArch}
        selectedIds={s.activeLoraStack.map((entry) => entry.id)}
        installingKey={s.loraInstallingKey}
        onSelect={(id) => {
          const pack = s.loraPacks.find((p) => p.id === id)
          if (!pack) return
          s.setLoraStack((prev) => {
            if (prev.some((entry) => entry.id === id)) return prev
            return [...prev, { id, strength: pack.defaultStrength }]
          })
        }}
        onInstall={(id, arch) => {
          void s.beginLoraInstall(id, arch)
        }}
        onDeleteUser={(id) => {
          void s
            .deleteUserLora(id)
            .then(() => {
              s.setLoraStack((prev) => prev.filter((entry) => entry.id !== id))
              notifySuccess("LoRA removed")
              return s.listLoras().then(s.setLoraPacks)
            })
            .catch((e) =>
              notifyError(e instanceof Error ? e.message : String(e))
            )
        }}
      />

      <ModelsLibraryDialog
        open={s.modelsOpen}
        onOpenChange={s.setModelsOpen}
        preferArch={s.activeDetail?.arch ?? null}
        onInstallLora={(id, arch) => {
          void s.beginLoraInstall(id, arch)
        }}
        onInstallUpscaler={(id) => {
          void s.beginUpscaleInstall(id)
        }}
      />

      <HfTokenDialog
        key={
          s.hfTokenDialogOpen
            ? (s.pendingInstallId ?? "hf-token")
            : "hf-token-closed"
        }
        open={s.hfTokenDialogOpen}
        onOpenChange={(open) => {
          s.setHfTokenDialogOpen(open)
          if (!open && !s.civitaiTokenDialogOpen) s.setPendingInstallId(null)
        }}
        blueprintName={
          s.pendingInstallId
            ? (s.blueprints.find((b) => b.id === s.pendingInstallId)?.name ??
              null)
            : null
        }
        onConfirm={s.handleHfTokenDialogConfirm}
      />

      <CivitaiTokenDialog
        key={
          s.civitaiTokenDialogOpen
            ? (s.pendingInstallId ?? "civitai-token")
            : "civitai-token-closed"
        }
        open={s.civitaiTokenDialogOpen}
        onOpenChange={(open) => {
          s.setCivitaiTokenDialogOpen(open)
          if (!open) s.setPendingInstallId(null)
        }}
        blueprintName={
          s.pendingInstallId
            ? (s.blueprints.find((b) => b.id === s.pendingInstallId)?.name ??
              null)
            : null
        }
        onConfirm={s.handleCivitaiTokenDialogConfirm}
      />

      <SettingsDialog
        open={s.settingsOpen}
        onOpenChange={s.setSettingsOpen}
        onBrowseModels={() => s.setModelsOpen(true)}
        comfy={s.comfy}
        comfyHealthy={s.comfyHealthy}
        runtimeMessage={s.runtimeMessage}
        runtimeBusy={s.runtimeBusy}
        onInstallComfy={() => void s.handleInstallComfy()}
        onStartComfy={() => void s.handleStartComfy()}
        onStopComfy={() => void s.handleStopComfy()}
        hfToken={s.hfToken}
        onHfTokenChange={(value) => {
          s.setHfToken(value)
          s.setHfTokenDirty(true)
        }}
        hfTokenDirty={s.hfTokenDirty}
        hfTokenSaving={s.hfTokenSaving}
        onSaveHfToken={() => void s.handleSaveHfToken()}
        civitaiToken={s.civitaiToken}
        onCivitaiTokenChange={(value) => {
          s.setCivitaiToken(value)
          s.setCivitaiTokenDirty(true)
        }}
        civitaiTokenDirty={s.civitaiTokenDirty}
        civitaiTokenSaving={s.civitaiTokenSaving}
        onSaveCivitaiToken={() => void s.handleSaveCivitaiToken()}
        gpu={s.gpu}
      />
    </div>
  )
}
