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

/** Expand a CivitAI URL into per-arch download URLs via `expand_civitai_lora_url`. */
export async function expandCivitaiLoraUrl(
  url: string
): Promise<CivitaiLoraExpand> {
  return commands.expandCivitaiLoraUrl(url)
}

/** Installed + user LoRA packs via `list_loras`. */
export async function listLoras(): Promise<LoraPack[]> {
  return commands.listLoras()
}

/** Single LoRA pack (variants, files, install state) via `get_lora`. */
export async function getLora(id: string): Promise<LoraPack> {
  return commands.getLora(id)
}

/** Enqueue a LoRA variant install via `install_lora_variant` (Download Manager). */
export async function installLoraVariant(
  id: string,
  arch: RecipeArch
): Promise<void> {
  await commands.installLoraVariant(id, arch)
}

/** Remove a variant weight if unused via `uninstall_lora_variant`. */
export async function uninstallLoraVariant(
  id: string,
  arch: RecipeArch
): Promise<UninstallSummary> {
  return commands.uninstallLoraVariant(id, arch)
}

/** Persist a user-authored LoRA pack via `save_user_lora`. */
export async function saveUserLora(input: SaveUserLoraArgs): Promise<LoraPack> {
  return commands.saveUserLora(input)
}

/** Delete a user-authored LoRA pack via `delete_user_lora`. */
export async function deleteUserLora(id: string): Promise<void> {
  await commands.deleteUserLora(id)
}

/** Open the user-LoRAs folder in the OS file manager via `open_user_loras_dir`. */
export async function openUserLorasDir(): Promise<string> {
  return commands.openUserLorasDir()
}

/** Write a custom thumbnail for a user LoRA via `set_user_lora_thumbnail`. */
export async function setUserLoraThumbnail(
  id: string,
  bytes: number[],
  ext: string
): Promise<string> {
  return commands.setUserLoraThumbnail(id, bytes, ext)
}

/** Drop a user LoRA's custom thumbnail via `clear_user_lora_thumbnail`. */
export async function clearUserLoraThumbnail(id: string): Promise<void> {
  await commands.clearUserLoraThumbnail(id)
}
