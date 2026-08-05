import { commands } from "@/lib/generated/bindings"
import type { RecipeArch } from "@/lib/arch"
import type {
  CivitaiLoraExpand,
  SaveUserLoraArgs,
  UninstallSummary,
} from "@/lib/generated/bindings"
import type { LoraPack } from "./types"

export type { UninstallSummary }

export type { CivitaiLoraExpand }

export async function expandCivitaiLoraUrl(
  url: string
): Promise<CivitaiLoraExpand> {
  return commands.expandCivitaiLoraUrl(url)
}

export async function listLoras(): Promise<LoraPack[]> {
  return commands.listLoras()
}

export async function getLora(id: string): Promise<LoraPack> {
  return commands.getLora(id)
}

export async function installLoraVariant(
  id: string,
  arch: RecipeArch
): Promise<void> {
  await commands.installLoraVariant(id, arch)
}

export async function uninstallLoraVariant(
  id: string,
  arch: RecipeArch
): Promise<UninstallSummary> {
  return commands.uninstallLoraVariant(id, arch)
}

export async function saveUserLora(input: SaveUserLoraArgs): Promise<LoraPack> {
  return commands.saveUserLora(input)
}

export async function deleteUserLora(id: string): Promise<void> {
  await commands.deleteUserLora(id)
}

export async function openUserLorasDir(): Promise<string> {
  return commands.openUserLorasDir()
}

export async function setUserLoraThumbnail(
  id: string,
  bytes: number[],
  ext: string
): Promise<string> {
  return commands.setUserLoraThumbnail(id, bytes, ext)
}

export async function clearUserLoraThumbnail(id: string): Promise<void> {
  await commands.clearUserLoraThumbnail(id)
}
