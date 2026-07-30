import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import { commands } from "@/lib/generated/bindings"
import type { UpscaleModelInfo } from "./types"

function asArch(arch?: string | null): RecipeArch | null {
  return arch && isRecipeArch(arch) ? arch : null
}

export function defaultUsduSteps(arch?: string | null): number {
  const a = asArch(arch)
  return a === "krea2" || a === "z-image" ? 8 : 12
}

export function defaultUsduDenoise(arch?: string | null): number {
  const a = asArch(arch)
  if (a === "krea2" || a === "z-image") return 0.15
  if (a === "flux" || a === "flux2" || a === "ideogram4") return 0.2
  return 0.25
}

export async function listUpscalers(): Promise<UpscaleModelInfo[]> {
  return commands.listUpscalers()
}

export async function installUpscaler(id: string): Promise<void> {
  await commands.installUpscaler(id)
}

export async function ensureUsduNode(): Promise<void> {
  await commands.ensureUsduNode()
}

export async function usduNodeReady(): Promise<boolean> {
  return commands.usduNodeReady()
}

export async function ensureSupirNode(): Promise<void> {
  await commands.ensureSupirNode()
}

export async function supirNodeReady(): Promise<boolean> {
  return commands.supirNodeReady()
}
