import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import { commands } from "@/lib/generated/bindings"
import type { UpscaleModelInfo } from "./types"

function asArch(arch?: string | null): RecipeArch | null {
  return arch && isRecipeArch(arch) ? arch : null
}

/** Default USDU steps for an arch (8 for krea2 / z-image, else 12). */
export function defaultUsduSteps(arch?: string | null): number {
  const a = asArch(arch)
  return a === "krea2" || a === "z-image" ? 8 : 12
}

/** Default USDU denoise for an arch (krea2/z-image 0.15, flux family 0.2, else 0.25). */
export function defaultUsduDenoise(arch?: string | null): number {
  const a = asArch(arch)
  if (a === "krea2" || a === "z-image") return 0.15
  if (a === "flux" || a === "flux2" || a === "ideogram4") return 0.2
  return 0.25
}

/** Installed + catalog upscale models via `list_upscalers`. */
export async function listUpscalers(): Promise<UpscaleModelInfo[]> {
  return commands.listUpscalers()
}

/** Enqueue upscale-weight install via `install_upscaler` (Download Manager). */
export async function installUpscaler(id: string): Promise<void> {
  await commands.installUpscaler(id)
}

/** Ensure Ultimate SD Upscale is at the app-pinned commit via `ensure_usdu_node`. */
export async function ensureUsduNode(): Promise<void> {
  await commands.ensureUsduNode()
}

/** Whether the USDU custom node is installed and pinned via `usdu_node_ready`. */
export async function usduNodeReady(): Promise<boolean> {
  return commands.usduNodeReady()
}

/** Ensure SUPIR is at the app-pinned commit + deps via `ensure_supir_node`. */
export async function ensureSupirNode(): Promise<void> {
  await commands.ensureSupirNode()
}

/** Whether the SUPIR custom node is installed and pinned via `supir_node_ready`. */
export async function supirNodeReady(): Promise<boolean> {
  return commands.supirNodeReady()
}
