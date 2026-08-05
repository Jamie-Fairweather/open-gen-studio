import { commands } from "@/lib/generated/bindings"
import type {
  CapturedWorkflow,
  ComfyStatus,
  EmbeddedModel,
  GpuInfo,
  PackagingSuggestions,
  RuntimeInstall,
  RuntimePinsStatus,
} from "./types"

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  )
}

export async function listSettings(): Promise<Record<string, string>> {
  return commands.listSettings()
}

export async function setSetting(key: string, value: string): Promise<void> {
  await commands.setSetting(key, value)
}

export type TokenProvider = import("@/lib/generated/bindings").TokenProvider
export type ProviderTokenStatus =
  import("@/lib/generated/bindings").ProviderTokenStatus

export async function setProviderToken(
  provider: TokenProvider,
  value: string
): Promise<void> {
  await commands.setProviderToken(provider, value)
}

export async function clearProviderToken(
  provider: TokenProvider
): Promise<void> {
  await commands.clearProviderToken(provider)
}

export async function providerTokenStatus(): Promise<ProviderTokenStatus> {
  return commands.providerTokenStatus()
}

export async function detectGpu(): Promise<GpuInfo> {
  return commands.detectGpu()
}

export async function listRuntimes(): Promise<RuntimeInstall[]> {
  return commands.listRuntimes()
}

export async function installComfyui(): Promise<RuntimeInstall> {
  return commands.installComfyui()
}

export async function startComfyui(): Promise<RuntimeInstall> {
  return commands.startComfyui()
}

export async function stopComfyui(): Promise<RuntimeInstall> {
  return commands.stopComfyui()
}

export async function comfyuiStatus(): Promise<ComfyStatus> {
  return commands.comfyuiStatus()
}

/** Expected vs installed pins for ComfyUI + managed custom nodes. */
export async function runtimePinsStatus(): Promise<RuntimePinsStatus> {
  return commands.runtimePinsStatus()
}

/** Open an http(s) URL in the system default browser (Tauri webview blocks window.open). */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  await commands.openExternalUrl(url)
}

export async function creatorEnsureComfy(): Promise<string> {
  return commands.creatorEnsureComfy()
}

export async function creatorOpenComfy(): Promise<string> {
  return commands.creatorOpenComfy()
}

export async function creatorCaptureWorkflow(): Promise<CapturedWorkflow> {
  return commands.creatorCaptureWorkflow()
}

export async function creatorSuggestPackaging(
  workflow: unknown,
  embeddedModels?: EmbeddedModel[]
): Promise<PackagingSuggestions> {
  return commands.creatorSuggestPackaging(workflow, embeddedModels ?? null)
}

export type DataDirInfo = import("@/lib/generated/bindings").DataDirInfo
export type SetDataDirResult =
  import("@/lib/generated/bindings").SetDataDirResult

export async function getDataDirInfo(): Promise<DataDirInfo> {
  return commands.getDataDirInfo()
}

export async function pickDataDir(): Promise<string | null> {
  return commands.pickDataDir()
}

export async function isDataDirMoving(): Promise<boolean> {
  return commands.isDataDirMoving()
}

export async function setDataDir(
  path: string | null
): Promise<SetDataDirResult> {
  return commands.setDataDir(path)
}

export async function openDataDir(): Promise<string> {
  return commands.openDataDir()
}

export async function relaunchApp(): Promise<void> {
  await commands.relaunchApp()
}
