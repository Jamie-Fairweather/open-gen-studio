import { commands } from "@/lib/generated/bindings"
import type {
  SaveUserBlueprintArgs,
  UninstallSummary,
} from "@/lib/generated/bindings"
import type {
  Blueprint,
  BlueprintDetail,
  ModelFileEntry,
  OfficialBlueprint,
  ResolvedModelUrl,
} from "./types"

export type { UninstallSummary }

/** Installed + user catalog via `list_blueprints`. Does not call `list_official_blueprints`. */
export async function listOfficialBlueprints(): Promise<OfficialBlueprint[]> {
  return listBlueprints()
}

/** Catalog of official, installed, and user blueprints via `list_blueprints`. */
export async function listBlueprints(): Promise<Blueprint[]> {
  return commands.listBlueprints()
}

/** Resolve a model page/file URL to a download URL + suggested filename. */
export async function resolveModelUrl(url: string): Promise<ResolvedModelUrl> {
  return commands.resolveModelUrl(url)
}

/** Enqueue an official pack install via `install_official_blueprint` (Download Manager, non-blocking). */
export async function installOfficialBlueprint(id: string): Promise<void> {
  await commands.installOfficialBlueprint(id)
}

/** Remove unused weight files for a pack via `uninstall_blueprint`. */
export async function uninstallBlueprint(
  id: string
): Promise<UninstallSummary> {
  return commands.uninstallBlueprint(id)
}

/** Abort an in-flight official install via `cancel_blueprint_install`. */
export async function cancelBlueprintInstall(): Promise<void> {
  await commands.cancelBlueprintInstall()
}

/** Scan the models folder via `list_model_files`. */
export async function listModelFiles(): Promise<ModelFileEntry[]> {
  return commands.listModelFiles()
}

/** Open the models folder in the OS file manager via `open_models_dir`. */
export async function openModelsDir(): Promise<string> {
  return commands.openModelsDir()
}

/** Blueprint detail via `get_blueprint`. Does not call `get_official_blueprint`. */
export async function getOfficialBlueprint(
  id: string
): Promise<BlueprintDetail> {
  return getBlueprint(id)
}

/** Full blueprint detail (nodes, files, install state) via `get_blueprint`. */
export async function getBlueprint(id: string): Promise<BlueprintDetail> {
  return commands.getBlueprint(id)
}

/** Persist a user-authored blueprint via `save_user_blueprint`. */
export async function saveUserBlueprint(
  input: SaveUserBlueprintArgs
): Promise<string> {
  return commands.saveUserBlueprint(input)
}

/** Delete a user-authored blueprint via `delete_user_blueprint`. */
export async function deleteUserBlueprint(id: string): Promise<void> {
  await commands.deleteUserBlueprint(id)
}

/** Open the user-blueprints folder in the OS file manager via `open_user_blueprints_dir`. */
export async function openUserBlueprintsDir(): Promise<string> {
  return commands.openUserBlueprintsDir()
}

/** Write a custom thumbnail for a user blueprint via `set_user_blueprint_thumbnail`. */
export async function setUserBlueprintThumbnail(
  id: string,
  bytes: number[],
  ext: string
): Promise<string> {
  return commands.setUserBlueprintThumbnail(id, bytes, ext)
}

/** Drop a user blueprint's custom thumbnail via `clear_user_blueprint_thumbnail`. */
export async function clearUserBlueprintThumbnail(id: string): Promise<void> {
  await commands.clearUserBlueprintThumbnail(id)
}
