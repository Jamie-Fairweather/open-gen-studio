"use client"

import { isRecipeArch } from "@/lib/arch"
import { useShallow } from "zustand/react/shallow"
import {
  BlueprintPickerDialog,
  LoraPickerDialog,
  ModelsLibraryDialog,
} from "@/components/libraries"
import {
  CivitaiTokenDialog,
  GatedModelDialog,
  GpuVendorDialog,
  HfTokenDialog,
  vendorOptionsFromAdapters,
} from "@/components/dialogs"
import { JobQueueExpandDialog } from "@/components/job-queue-chrome"
import { SETTING_GPU_VENDOR } from "@/components/studio/slices/helpers"
import { setSetting } from "@/lib/host"
import {
  selectActiveArch,
  selectActiveDetail,
  selectActiveLoraStack,
  selectActiveSelectedId,
  selectInstallingId,
  selectInstallQueue,
  selectLoraInstallingKey,
  selectLoraQueuedKeys,
  selectTabBlueprints,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { notifySuccess } from "@/lib/notify"

/** Store-wired dialogs mounted once under studio chrome. */
export function StudioDialogs() {
  const picker = useStudioStore(
    useShallow((s) => ({
      open: s.pickerOpen,
      onOpenChange: s.setPickerOpen,
      onSelect: s.selectBlueprint,
      onInstall: s.handleInstallBlueprint,
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
      gatedOpen: s.gatedModelDialogOpen,
      setGatedOpen: s.setGatedModelDialogOpen,
      gatedRepos: s.gatedModelRepos,
      handleGatedConfirm: s.handleGatedModelDialogConfirm,
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

  const gpu = useStudioStore((s) => s.gpu)
  const gpuVendorDialogOpen = useStudioStore((s) => s.gpuVendorDialogOpen)
  const setGpuVendorDialogOpen = useStudioStore((s) => s.setGpuVendorDialogOpen)
  const handleInstallComfy = useStudioStore((s) => s.handleInstallComfy)
  const gpuVendorOptions = gpu ? vendorOptionsFromAdapters(gpu.adapters) : []

  return (
    <>
      <JobQueueExpandDialog />

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

      <GatedModelDialog
        key={
          tokens.gatedOpen
            ? (tokens.pendingInstallId ?? "gated-model")
            : "gated-model-closed"
        }
        open={tokens.gatedOpen}
        onOpenChange={(open) => {
          tokens.setGatedOpen(open)
          // Cancel only — confirm keeps pendingInstallId / gatedTermsAcked.
          if (!open && !tokens.hfOpen && !tokens.civitaiOpen) {
            const acked = useStudioStore.getState().gatedTermsAcked
            if (!acked) tokens.setPendingInstallId(null)
          }
        }}
        blueprintName={
          tokens.pendingInstallId
            ? (tokens.blueprints.find((b) => b.id === tokens.pendingInstallId)
                ?.name ?? null)
            : null
        }
        repos={tokens.gatedRepos}
        onConfirm={tokens.handleGatedConfirm}
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
    </>
  )
}
