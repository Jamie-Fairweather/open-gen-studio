import { commands } from "@/lib/generated/bindings"
import type {
  CapturedWorkflow,
  ComfyStatus,
  EmbeddedModel,
  GpuInfo,
  PackagingSuggestions,
  RuntimeInstall,
  RuntimePinsStatus,
  SystemSpecs,
} from "./types"

/** True when running inside the Tauri webview (`__TAURI__` / `__TAURI_INTERNALS__`). */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  )
}

/** Persisted app settings map via `list_settings`. */
export async function listSettings(): Promise<Record<string, string>> {
  return commands.listSettings()
}

/** Write one settings key via `set_setting`. */
export async function setSetting(key: string, value: string): Promise<void> {
  await commands.setSetting(key, value)
}

/** Which host stores the API token (`huggingface` | `civitai` | …) — not the secret itself. */
export type TokenProvider = import("@/lib/generated/bindings").TokenProvider
/** Which provider tokens are present; never includes the secrets. */
export type ProviderTokenStatus =
  import("@/lib/generated/bindings").ProviderTokenStatus

/** Persist a provider API token via `set_provider_token`. */
export async function setProviderToken(
  provider: TokenProvider,
  value: string
): Promise<void> {
  await commands.setProviderToken(provider, value)
}

/** Forget a stored provider token via `clear_provider_token`. */
export async function clearProviderToken(
  provider: TokenProvider
): Promise<void> {
  await commands.clearProviderToken(provider)
}

/** Which provider tokens are present (not the secrets) via `provider_token_status`. */
export async function providerTokenStatus(): Promise<ProviderTokenStatus> {
  return commands.providerTokenStatus()
}

/** Detect the active GPU via `detect_gpu`. */
export async function detectGpu(): Promise<GpuInfo> {
  return commands.detectGpu()
}

/** RAM + VRAM snapshot for first-run hardware gating via `get_system_specs`. */
export async function getSystemSpecs(): Promise<SystemSpecs> {
  return commands.getSystemSpecs()
}

/** Installed runtime records via `list_runtimes`. */
export async function listRuntimes(): Promise<RuntimeInstall[]> {
  return commands.listRuntimes()
}

/** Force-reinstall pinned portable ComfyUI via `install_comfyui` (Download Manager). */
export async function installComfyui(): Promise<RuntimeInstall> {
  return commands.installComfyui()
}

/** Spawn ComfyUI via `start_comfyui`; returns immediately, health wait is background. */
export async function startComfyui(): Promise<RuntimeInstall> {
  return commands.startComfyui()
}

/** Stop the managed ComfyUI process via `stop_comfyui`. */
export async function stopComfyui(): Promise<RuntimeInstall> {
  return commands.stopComfyui()
}

/** Live ComfyUI health / port via `comfyui_status`. */
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

/** Start or wait for Comfy for the creator flow via `creator_ensure_comfy`. */
export async function creatorEnsureComfy(): Promise<string> {
  return commands.creatorEnsureComfy()
}

/** Open ComfyUI in the system browser via `creator_open_comfy`. */
export async function creatorOpenComfy(): Promise<string> {
  return commands.creatorOpenComfy()
}

/** Snapshot the live Comfy workflow via `creator_capture_workflow`. */
export async function creatorCaptureWorkflow(): Promise<CapturedWorkflow> {
  return commands.creatorCaptureWorkflow()
}

/** Suggest blueprint packaging for a captured workflow via `creator_suggest_packaging`. */
export async function creatorSuggestPackaging(
  workflow: unknown,
  embeddedModels?: EmbeddedModel[]
): Promise<PackagingSuggestions> {
  return commands.creatorSuggestPackaging(workflow, embeddedModels ?? null)
}

/** Current data-directory path and whether a move is in flight. */
export type DataDirInfo = import("@/lib/generated/bindings").DataDirInfo
/** Outcome of `set_data_dir` — may start a move rather than finishing immediately. */
export type SetDataDirResult =
  import("@/lib/generated/bindings").SetDataDirResult

/** Current data-directory path and move state via `get_data_dir_info`. */
export async function getDataDirInfo(): Promise<DataDirInfo> {
  return commands.getDataDirInfo()
}

/** Native folder picker for a new data directory via `pick_data_dir`. */
export async function pickDataDir(): Promise<string | null> {
  return commands.pickDataDir()
}

/** Whether a data-directory move is in flight via `is_data_dir_moving`. */
export async function isDataDirMoving(): Promise<boolean> {
  return commands.isDataDirMoving()
}

/** Switch or reset the data directory via `set_data_dir`; may start a move. */
export async function setDataDir(
  path: string | null
): Promise<SetDataDirResult> {
  return commands.setDataDir(path)
}

/** Open the data directory in the OS file manager via `open_data_dir`. */
export async function openDataDir(): Promise<string> {
  return commands.openDataDir()
}

/** Restart the desktop app via `relaunch_app`. */
export async function relaunchApp(): Promise<void> {
  await commands.relaunchApp()
}
