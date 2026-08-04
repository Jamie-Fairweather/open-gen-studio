import { commands } from "@/lib/generated/bindings"
import type { SaveUserBlueprintArgs } from "@/lib/generated/bindings"
import type {
  Blueprint,
  BlueprintDetail,
  ModelFileEntry,
  OfficialBlueprint,
  ResolvedModelUrl,
} from "./types"

export async function listOfficialBlueprints(): Promise<OfficialBlueprint[]> {
  return listBlueprints()
}

export async function listBlueprints(): Promise<Blueprint[]> {
  return commands.listBlueprints()
}

/** Resolve a model page/file URL to a download URL + suggested filename. */
export async function resolveModelUrl(url: string): Promise<ResolvedModelUrl> {
  return commands.resolveModelUrl(url)
}

export async function installOfficialBlueprint(id: string): Promise<void> {
  await commands.installOfficialBlueprint(id)
}

export async function cancelBlueprintInstall(): Promise<void> {
  await commands.cancelBlueprintInstall()
}

export async function listModelFiles(): Promise<ModelFileEntry[]> {
  return commands.listModelFiles()
}

export async function openModelsDir(): Promise<string> {
  return commands.openModelsDir()
}

export async function getOfficialBlueprint(
  id: string
): Promise<BlueprintDetail> {
  return getBlueprint(id)
}

export async function getBlueprint(id: string): Promise<BlueprintDetail> {
  return commands.getBlueprint(id)
}

export async function saveUserBlueprint(
  input: SaveUserBlueprintArgs
): Promise<string> {
  return commands.saveUserBlueprint(input)
}

export async function deleteUserBlueprint(id: string): Promise<void> {
  await commands.deleteUserBlueprint(id)
}

export async function openUserBlueprintsDir(): Promise<string> {
  return commands.openUserBlueprintsDir()
}

export async function setUserBlueprintThumbnail(
  id: string,
  bytes: number[],
  ext: string
): Promise<string> {
  return commands.setUserBlueprintThumbnail(id, bytes, ext)
}

export async function clearUserBlueprintThumbnail(id: string): Promise<void> {
  await commands.clearUserBlueprintThumbnail(id)
}
