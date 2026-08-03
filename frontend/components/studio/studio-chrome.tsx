"use client"

import { LayersIcon, SettingsIcon } from "lucide-react"
import { isRecipeArch } from "@/lib/arch"
import Link from "next/link"
import type { ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { BlueprintPickerDialog } from "@/components/blueprint-picker-dialog"
import { CivitaiTokenDialog } from "@/components/civitai-token-dialog"
import {
  GpuVendorDialog,
  vendorOptionsFromAdapters,
} from "@/components/gpu-vendor-dialog"
import { HfTokenDialog } from "@/components/hf-token-dialog"
import { LoraPickerDialog } from "@/components/lora-picker-dialog"
import { ModelsLibraryDialog } from "@/components/models-library-dialog"
import { JobQueuePopover } from "@/components/job-queue-popover"
import { SettingsDialog } from "@/components/settings-dialog"
import { SETTING_GPU_VENDOR } from "@/components/studio/slices/helpers"
import { setSetting } from "@/lib/host"
import {
  selectActiveArch,
  selectActiveDetail,
  selectActiveLoraStack,
  selectActiveSelectedId,
  selectComfy,
  selectInstallingId,
  selectInstallQueue,
  selectLoraInstallingKey,
  selectLoraQueuedKeys,
  selectTabBlueprints,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { STUDIO_TABS } from "@/components/studio/studio-tabs"
import { Titlebar } from "@/components/titlebar"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

export function StudioChrome({ children }: { children: ReactNode }) {
  const desktop = useStudioStore((s) => s.desktop)
  const studioTab = useStudioStore((s) => s.studioTab)
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)
  const setSettingsOpen = useStudioStore((s) => s.setSettingsOpen)

  const picker = useStudioStore(
    useShallow((s) => ({
      open: s.pickerOpen,
      onOpenChange: s.setPickerOpen,
      onSelect: s.selectBlueprint,
      onInstall: s.handleInstallBlueprint,
      onEdit: s.openCreatorEdit,
      sizesProbing: s.sizesProbing,
    }))
  )
  const tabBlueprints = useStudioSelector(selectTabBlueprints)
  const activeSelectedId = useStudioSelector(selectActiveSelectedId)
  const installingId = useStudioSelector(selectInstallingId)
  const installQueue = useStudioSelector(selectInstallQueue)

  const lora = useStudioStore(
    useShallow((s) => ({
      open: s.loraPickerOpen,
      onOpenChange: s.setLoraPickerOpen,
      packs: s.loraPacks,
      setLoraStack: s.setLoraStack,
      beginLoraInstall: s.beginLoraInstall,
      deleteUserLora: s.deleteUserLora,
      listLoras: s.listLoras,
      setLoraPacks: s.setLoraPacks,
    }))
  )
  const activeArch = useStudioSelector(selectActiveArch)
  const activeLoraStack = useStudioSelector(selectActiveLoraStack)
  const loraInstallingKey = useStudioSelector(selectLoraInstallingKey)
  const loraQueuedKeys = useStudioSelector(selectLoraQueuedKeys)

  const modelsOpen = useStudioStore((s) => s.modelsOpen)
  const setModelsOpen = useStudioStore((s) => s.setModelsOpen)
  const activeDetail = useStudioSelector(selectActiveDetail)
  const beginUpscaleInstall = useStudioStore((s) => s.beginUpscaleInstall)

  const tokens = useStudioStore(
    useShallow((s) => ({
      hfOpen: s.hfTokenDialogOpen,
      setHfOpen: s.setHfTokenDialogOpen,
      civitaiOpen: s.civitaiTokenDialogOpen,
      setCivitaiOpen: s.setCivitaiTokenDialogOpen,
      pendingInstallId: s.pendingInstallId,
      setPendingInstallId: s.setPendingInstallId,
      blueprints: s.blueprints,
      handleHfConfirm: s.handleHfTokenDialogConfirm,
      handleCivitaiConfirm: s.handleCivitaiTokenDialogConfirm,
    }))
  )

  const settings = useStudioStore(
    useShallow((s) => ({
      open: s.settingsOpen,
      onOpenChange: s.setSettingsOpen,
      comfyHealthy: s.comfyHealthy,
      runtimeMessage: s.runtimeMessage,
      runtimeBusy: s.runtimeBusy,
      onInstallComfy: s.handleInstallComfy,
      onStartComfy: s.handleStartComfy,
      onStopComfy: s.handleStopComfy,
      hfToken: s.hfToken,
      setHfToken: s.setHfToken,
      setHfTokenDirty: s.setHfTokenDirty,
      hfTokenDirty: s.hfTokenDirty,
      hfTokenSaving: s.hfTokenSaving,
      onSaveHfToken: s.handleSaveHfToken,
      civitaiToken: s.civitaiToken,
      setCivitaiToken: s.setCivitaiToken,
      setCivitaiTokenDirty: s.setCivitaiTokenDirty,
      civitaiTokenDirty: s.civitaiTokenDirty,
      civitaiTokenSaving: s.civitaiTokenSaving,
      onSaveCivitaiToken: s.handleSaveCivitaiToken,
      gpu: s.gpu,
    }))
  )
  const gpuVendorDialogOpen = useStudioStore((s) => s.gpuVendorDialogOpen)
  const setGpuVendorDialogOpen = useStudioStore((s) => s.setGpuVendorDialogOpen)
  const handleInstallComfy = useStudioStore((s) => s.handleInstallComfy)
  const comfy = useStudioSelector(selectComfy)
  const gpuVendorOptions = settings.gpu
    ? vendorOptionsFromAdapters(settings.gpu.adapters)
    : []

  if (!desktop) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open Gen Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Local store and host APIs run inside the Tauri desktop shell. Start
          with <code className="font-mono text-xs">bun run desktop</code>.
        </p>
      </div>
    )
  }

  const downloading =
    downloadSnapshot.active != null || downloadSnapshot.queued.length > 0

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <Titlebar
        leading={
          <div className="flex items-center gap-2 text-sm font-medium">
            <LayersIcon className="size-4 text-primary" />
            <span className="hidden sm:inline">Open Gen Studio</span>
          </div>
        }
      >
        <nav className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto text-sm [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {STUDIO_TABS.map((tab) => {
            const active = studioTab === tab.id
            const showDot = tab.id === "downloads" && downloading
            return (
              <Link
                key={tab.id}
                href={`/${tab.id}`}
                className={cn(
                  "relative shrink-0 px-2 py-1 transition-colors sm:px-2.5",
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
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary sm:inset-x-2.5" />
                ) : null}
              </Link>
            )
          })}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 items-center gap-0.5">
            <JobQueuePopover />
            <WithTooltip label="Settings">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                className="shrink-0"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <SettingsIcon />
              </Button>
            </WithTooltip>
          </div>
        </nav>
      </Titlebar>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>

      <BlueprintPickerDialog
        open={picker.open}
        onOpenChange={picker.onOpenChange}
        blueprints={tabBlueprints}
        selectedId={activeSelectedId}
        installingId={installingId}
        queuedIds={installQueue}
        sizesProbing={picker.sizesProbing}
        onSelect={picker.onSelect}
        onInstall={(id) => void picker.onInstall(id)}
        onEdit={picker.onEdit}
      />

      <LoraPickerDialog
        open={lora.open}
        onOpenChange={lora.onOpenChange}
        packs={lora.packs}
        arch={activeArch}
        selectedIds={activeLoraStack.map((entry) => entry.id)}
        installingKey={loraInstallingKey}
        queuedKeys={loraQueuedKeys}
        onSelect={(id) => {
          const pack = lora.packs.find((p) => p.id === id)
          if (!pack) return
          lora.setLoraStack((prev) => {
            if (prev.some((entry) => entry.id === id)) return prev
            return [...prev, { id, strength: pack.defaultStrength ?? 1 }]
          })
        }}
        onInstall={(id, arch) => {
          if (!isRecipeArch(arch)) return
          void lora.beginLoraInstall(id, arch)
        }}
        onDeleteUser={(id) => {
          void lora
            .deleteUserLora(id)
            .then(() => {
              lora.setLoraStack((prev) =>
                prev.filter((entry) => entry.id !== id)
              )
              notifySuccess("LoRA removed")
              return lora.listLoras().then(lora.setLoraPacks)
            })
            .catch((e) =>
              notifyError(e instanceof Error ? e.message : String(e))
            )
        }}
      />

      <ModelsLibraryDialog
        open={modelsOpen}
        onOpenChange={setModelsOpen}
        preferArch={activeDetail?.arch ?? null}
        onInstallLora={(id, arch) => {
          if (!isRecipeArch(arch)) return
          void lora.beginLoraInstall(id, arch)
        }}
        onInstallUpscaler={(id) => {
          void beginUpscaleInstall(id)
        }}
      />

      <HfTokenDialog
        key={
          tokens.hfOpen
            ? (tokens.pendingInstallId ?? "hf-token")
            : "hf-token-closed"
        }
        open={tokens.hfOpen}
        onOpenChange={(open) => {
          tokens.setHfOpen(open)
          if (!open && !tokens.civitaiOpen) tokens.setPendingInstallId(null)
        }}
        blueprintName={
          tokens.pendingInstallId
            ? (tokens.blueprints.find((b) => b.id === tokens.pendingInstallId)
                ?.name ?? null)
            : null
        }
        onConfirm={tokens.handleHfConfirm}
      />

      <CivitaiTokenDialog
        key={
          tokens.civitaiOpen
            ? (tokens.pendingInstallId ?? "civitai-token")
            : "civitai-token-closed"
        }
        open={tokens.civitaiOpen}
        onOpenChange={(open) => {
          tokens.setCivitaiOpen(open)
          if (!open) tokens.setPendingInstallId(null)
        }}
        blueprintName={
          tokens.pendingInstallId
            ? (tokens.blueprints.find((b) => b.id === tokens.pendingInstallId)
                ?.name ?? null)
            : null
        }
        onConfirm={tokens.handleCivitaiConfirm}
      />

      <SettingsDialog
        open={settings.open}
        onOpenChange={settings.onOpenChange}
        onBrowseModels={() => setModelsOpen(true)}
        comfy={comfy}
        comfyHealthy={settings.comfyHealthy}
        runtimeMessage={settings.runtimeMessage}
        runtimeBusy={settings.runtimeBusy}
        onInstallComfy={() => void settings.onInstallComfy()}
        onStartComfy={() => void settings.onStartComfy()}
        onStopComfy={() => void settings.onStopComfy()}
        hfToken={settings.hfToken}
        onHfTokenChange={(value) => {
          settings.setHfToken(value)
          settings.setHfTokenDirty(true)
        }}
        hfTokenDirty={settings.hfTokenDirty}
        hfTokenSaving={settings.hfTokenSaving}
        onSaveHfToken={() => void settings.onSaveHfToken()}
        civitaiToken={settings.civitaiToken}
        onCivitaiTokenChange={(value) => {
          settings.setCivitaiToken(value)
          settings.setCivitaiTokenDirty(true)
        }}
        civitaiTokenDirty={settings.civitaiTokenDirty}
        civitaiTokenSaving={settings.civitaiTokenSaving}
        onSaveCivitaiToken={() => void settings.onSaveCivitaiToken()}
        gpu={settings.gpu}
      />

      <GpuVendorDialog
        open={gpuVendorDialogOpen}
        dismissible={false}
        onOpenChange={setGpuVendorDialogOpen}
        options={gpuVendorOptions}
        onConfirm={async (vendor) => {
          await setSetting(SETTING_GPU_VENDOR, vendor)
          setGpuVendorDialogOpen(false)
          notifySuccess("GPU selected", "Installing the matching runtime…")
          // Kick install now that a vendor is chosen (auto-install was skipped).
          void handleInstallComfy()
        }}
      />
    </div>
  )
}
