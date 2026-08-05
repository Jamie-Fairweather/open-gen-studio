"use client"

import { useEffect, useState } from "react"
import {
  GpuVendorDialog,
  vendorOptionsFromAdapters,
} from "@/components/dialogs"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/shell"
import { SettingsComfyCard } from "@/components/settings/settings-comfy-card"
import { SettingsGpuCard } from "@/components/settings/settings-gpu-card"
import { SettingsModelsCard } from "@/components/settings/settings-models-card"
import { SettingsTokenCard } from "@/components/settings/settings-token-card"
import {
  isTauri,
  listSettings,
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

type SettingsPanelProps = {
  onBrowseModels: () => void
  comfy: RuntimeInstall | null | undefined
  comfyHealthy: boolean
  runtimeMessage: string | null
  runtimeBusy: boolean
  onInstallComfy: () => void
  onStartComfy: () => void
  onStopComfy: () => void
  hasHfToken: boolean
  hfToken: string
  onHfTokenChange: (value: string) => void
  hfTokenDirty: boolean
  hfTokenSaving: boolean
  onSaveHfToken: () => void
  onClearHfToken: () => void
  hasCivitaiToken: boolean
  civitaiToken: string
  onCivitaiTokenChange: (value: string) => void
  civitaiTokenDirty: boolean
  civitaiTokenSaving: boolean
  onSaveCivitaiToken: () => void
  onClearCivitaiToken: () => void
  gpu: GpuInfo | null
  onGpuVendorChanged?: () => void
}

export function SettingsPanel({
  onBrowseModels,
  comfy,
  comfyHealthy,
  runtimeMessage,
  runtimeBusy,
  onInstallComfy,
  onStartComfy,
  onStopComfy,
  hasHfToken,
  hfToken,
  onHfTokenChange,
  hfTokenDirty,
  hfTokenSaving,
  onSaveHfToken,
  onClearHfToken,
  hasCivitaiToken,
  civitaiToken,
  onCivitaiTokenChange,
  civitaiTokenDirty,
  civitaiTokenSaving,
  onSaveCivitaiToken,
  onClearCivitaiToken,
  gpu,
  onGpuVendorChanged,
}: SettingsPanelProps) {
  const [pins, setPins] = useState<RuntimePinsStatus | null>(null)
  const [savedVendor, setSavedVendor] = useState<GpuVendor | null>(null)
  const [nvidiaOverride, setNvidiaOverride] = useState<"" | NvidiaVariant>("")
  const [changeGpuOpen, setChangeGpuOpen] = useState(false)
  const [overrideBusy, setOverrideBusy] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
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
  }, [comfy?.version, comfy?.status, runtimeBusy])

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
      <StudioPanel>
        <StudioPanelHeader
          title="Settings"
          description="Runtime and host preferences for this machine."
        />
        <StudioPanelBody className="gap-4 text-sm">
          <SettingsGpuCard
            gpu={gpu}
            activeVendor={activeVendor}
            activeAdapter={activeAdapter}
            effectiveVariant={effectiveVariant}
            nvidiaOverride={nvidiaOverride}
            canChangeVendor={canChangeVendor}
            overrideBusy={overrideBusy}
            onChangeGpu={() => setChangeGpuOpen(true)}
            onSaveNvidiaOverride={(next) => {
              void saveNvidiaOverride(next)
            }}
          />
          <SettingsModelsCard onBrowseModels={onBrowseModels} />
          <SettingsComfyCard
            comfy={comfy}
            comfyHealthy={comfyHealthy}
            runtimeMessage={runtimeMessage}
            runtimeBusy={runtimeBusy}
            pins={pins}
            onInstallComfy={onInstallComfy}
            onStartComfy={onStartComfy}
            onStopComfy={onStopComfy}
          />
          <SettingsTokenCard
            title="Hugging Face"
            description="Access token for gated models (e.g. Black Forest Labs). Accept the model license on Hugging Face first, then paste a token with read access. Tokens are stored in the OS credential store, not in app files."
            savedLabel="Token saved on this device"
            hasToken={hasHfToken}
            token={hfToken}
            onTokenChange={onHfTokenChange}
            dirty={hfTokenDirty}
            saving={hfTokenSaving}
            onSave={onSaveHfToken}
            onClear={onClearHfToken}
            fieldLabel="Access token"
            placeholderUnset="hf_…"
            placeholderReplace="Enter new token to replace…"
            saveLabel="Save token"
            savingLabel="Saving…"
            externalLabel="Get a token"
            externalUrl="https://huggingface.co/settings/tokens/new?preset=read-only"
          />
          <SettingsTokenCard
            title="CivitAI"
            description={
              <>
                API key for model downloads. On your account page, scroll to{" "}
                <span className="font-medium text-foreground">API Keys</span>,
                create a key, then paste it here. Keys are stored in the OS
                credential store, not in app files.
              </>
            }
            savedLabel="API key saved on this device"
            hasToken={hasCivitaiToken}
            token={civitaiToken}
            onTokenChange={onCivitaiTokenChange}
            dirty={civitaiTokenDirty}
            saving={civitaiTokenSaving}
            onSave={onSaveCivitaiToken}
            onClear={onClearCivitaiToken}
            fieldLabel="API key"
            placeholderUnset="Paste API key…"
            placeholderReplace="Enter new key to replace…"
            saveLabel="Save key"
            savingLabel="Saving…"
            externalLabel="Open account settings"
            externalUrl="https://civitai.com/user/account"
          />
        </StudioPanelBody>
      </StudioPanel>

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
          onInstallComfy()
        }}
      />
    </>
  )
}
