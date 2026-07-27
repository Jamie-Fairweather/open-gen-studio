import { commands } from "@/lib/generated/bindings"
import type { RecipeArch } from "@/lib/arch"
import type { SaveUserLoraArgs } from "@/lib/generated/bindings"
import type { LoraPack } from "./types"

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

export async function saveUserLora(input: SaveUserLoraArgs): Promise<LoraPack> {
  return commands.saveUserLora(input)
}

export async function deleteUserLora(id: string): Promise<void> {
  await commands.deleteUserLora(id)
}
