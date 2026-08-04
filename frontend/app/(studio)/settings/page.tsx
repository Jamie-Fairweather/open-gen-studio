"use client"

import { useShallow } from "zustand/react/shallow"
import { SettingsPanel } from "@/components/settings"
import { selectComfy } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"

export default function SettingsStudioPage() {
  const setModelsOpen = useStudioStore((s) => s.setModelsOpen)
  const comfy = useStudioSelector(selectComfy)
  const settings = useStudioStore(
    useShallow((s) => ({
      comfyHealthy: s.comfyHealthy,
      runtimeMessage: s.runtimeMessage,
      runtimeBusy: s.runtimeBusy,
      onInstallComfy: s.handleInstallComfy,
      onStartComfy: s.handleStartComfy,
      onStopComfy: s.handleStopComfy,
      hasHfToken: s.hasHfToken,
      hfToken: s.hfToken,
      setHfToken: s.setHfToken,
      setHfTokenDirty: s.setHfTokenDirty,
      hfTokenDirty: s.hfTokenDirty,
      hfTokenSaving: s.hfTokenSaving,
      onSaveHfToken: s.handleSaveHfToken,
      onClearHfToken: s.handleClearHfToken,
      hasCivitaiToken: s.hasCivitaiToken,
      civitaiToken: s.civitaiToken,
      setCivitaiToken: s.setCivitaiToken,
      setCivitaiTokenDirty: s.setCivitaiTokenDirty,
      civitaiTokenDirty: s.civitaiTokenDirty,
      civitaiTokenSaving: s.civitaiTokenSaving,
      onSaveCivitaiToken: s.handleSaveCivitaiToken,
      onClearCivitaiToken: s.handleClearCivitaiToken,
      gpu: s.gpu,
    }))
  )

  return (
    <div className="absolute inset-0 flex flex-col">
      <SettingsPanel
        onBrowseModels={() => setModelsOpen(true)}
        comfy={comfy}
        comfyHealthy={settings.comfyHealthy}
        runtimeMessage={settings.runtimeMessage}
        runtimeBusy={settings.runtimeBusy}
        onInstallComfy={() => void settings.onInstallComfy()}
        onStartComfy={() => void settings.onStartComfy()}
        onStopComfy={() => void settings.onStopComfy()}
        hasHfToken={settings.hasHfToken}
        hfToken={settings.hfToken}
        onHfTokenChange={(value) => {
          settings.setHfToken(value)
          settings.setHfTokenDirty(true)
        }}
        hfTokenDirty={settings.hfTokenDirty}
        hfTokenSaving={settings.hfTokenSaving}
        onSaveHfToken={() => void settings.onSaveHfToken()}
        onClearHfToken={() => void settings.onClearHfToken()}
        hasCivitaiToken={settings.hasCivitaiToken}
        civitaiToken={settings.civitaiToken}
        onCivitaiTokenChange={(value) => {
          settings.setCivitaiToken(value)
          settings.setCivitaiTokenDirty(true)
        }}
        civitaiTokenDirty={settings.civitaiTokenDirty}
        civitaiTokenSaving={settings.civitaiTokenSaving}
        onSaveCivitaiToken={() => void settings.onSaveCivitaiToken()}
        onClearCivitaiToken={() => void settings.onClearCivitaiToken()}
        gpu={settings.gpu}
      />
    </div>
  )
}
