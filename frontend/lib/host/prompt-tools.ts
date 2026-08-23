import { commands } from "@/lib/generated/bindings"
import type { Job, PromptToolWeightInfo } from "./types"

/** Catalog of prompt-tool weight files and readiness via `list_prompt_tool_weights`. */
export async function listPromptToolWeights(): Promise<PromptToolWeightInfo[]> {
  return commands.listPromptToolWeights()
}

/** Enqueue a prompt-tools provider install via `ensure_prompt_tools_provider` (Download Manager). */
export async function ensurePromptToolsProvider(
  providerId: string
): Promise<void> {
  await commands.ensurePromptToolsProvider(providerId)
}

/** Write a temp image for tools via `save_temp_tool_image`. */
export async function saveTempToolImage(
  bytes: number[] | Uint8Array,
  ext: string
): Promise<string> {
  return commands.saveTempToolImage(Array.from(bytes), ext)
}

/** Queue image→prompt via `run_image_to_prompt`; returns immediately, result on `jobs://progress`. */
export async function runImageToPrompt(args: {
  imagePath: string
  format: string
  target: string
  arch?: string | null
}): Promise<Job> {
  return commands.runImageToPrompt({
    imagePath: args.imagePath,
    format: args.format,
    target: args.target,
    arch: args.arch ?? null,
  })
}

/** Queue prompt enhance via `run_prompt_enhance`; returns immediately as a Job. */
export async function runPromptEnhance(args: {
  prompt: string
  target: string
  arch?: string | null
  mode?: string | null
}): Promise<Job> {
  return commands.runPromptEnhance({
    prompt: args.prompt,
    target: args.target,
    arch: args.arch ?? null,
    mode: args.mode ?? null,
  })
}
