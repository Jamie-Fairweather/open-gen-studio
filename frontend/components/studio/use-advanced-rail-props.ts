"use client"

import { useShallow } from "zustand/react/shallow"
import {
  selectActiveArch,
  selectActiveLoraStack,
  selectAdvancedControls,
  selectLatestGallerySeed,
  selectLoraInstallingKey,
  selectLoraQueuedKeys,
  selectSelected,
  selectSupportsLoras,
  selectUpscaleInstallingId,
  selectUpscalePendingIds,
  selectUpscaleQueuedIds,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"

/** Advanced-rail store bindings: controls, LoRA stack, Refine, and install chips. */
export function useAdvancedRailProps() {
  const studioTab = useStudioStore((s) => s.studioTab)
  const selected = useStudioSelector(selectSelected)

  const advanced = useStudioStore(
    useShallow((s) => ({
      open: s.advancedOpen,
      setOpen: s.setAdvancedOpen,
      controlValues: s.controlValues,
      setControlValues: s.setControlValues,
      loraPacks: s.loraPacks,
      setLoraStack: s.setLoraStack,
      setLoraPickerOpen: s.setLoraPickerOpen,
      beginLoraInstall: s.beginLoraInstall,
      generating: s.generating,
      isInstalled: s.isInstalled,
      upscaleEnabled: s.upscaleEnabled,
      setUpscaleEnabled: s.setUpscaleEnabled,
      upscaleModelId: s.upscaleModelId,
      setUpscaleModelId: s.setUpscaleModelId,
      usduEnabled: s.usduEnabled,
      setUsduEnabled: s.setUsduEnabled,
      usduScale: s.usduScale,
      setUsduScale: s.setUsduScale,
      usduSteps: s.usduSteps,
      setUsduSteps: s.setUsduSteps,
      usduDenoise: s.usduDenoise,
      setUsduDenoise: s.setUsduDenoise,
      upscaleModels: s.upscaleModels,
      usduReady: s.usduReady,
      beginUpscaleInstall: s.beginUpscaleInstall,
      beginUsduInstall: s.beginUsduInstall,
    }))
  )
  const advancedControls = useStudioSelector(selectAdvancedControls)
  const latestGallerySeed = useStudioSelector(selectLatestGallerySeed)
  const supportsLoras = useStudioSelector(selectSupportsLoras)
  const activeArch = useStudioSelector(selectActiveArch)
  const activeLoraStack = useStudioSelector(selectActiveLoraStack)
  const loraInstallingKey = useStudioSelector(selectLoraInstallingKey)
  const loraQueuedKeys = useStudioSelector(selectLoraQueuedKeys)
  const upscaleInstallingId = useStudioSelector(selectUpscaleInstallingId)
  const upscaleQueuedIds = useStudioSelector(selectUpscaleQueuedIds)
  const upscalePendingIds = useStudioSelector(selectUpscalePendingIds)

  return {
    studioTab,
    selected,
    advanced,
    advancedControls,
    latestGallerySeed,
    supportsLoras,
    activeArch,
    activeLoraStack,
    loraInstallingKey,
    loraQueuedKeys,
    upscaleInstallingId,
    upscaleQueuedIds,
    upscalePendingIds,
  }
}
