import { commands } from "@/lib/generated/bindings"
import type { Job, PromptToolWeightInfo } from "./types"

export async function listPromptToolWeights(): Promise<PromptToolWeightInfo[]> {
  return commands.listPromptToolWeights()
}

export async function ensurePromptToolsProvider(
  providerId: string
): Promise<void> {
  await commands.ensurePromptToolsProvider(providerId)
}

export async function readImageEmbeddedPrompt(
  imagePath: string
): Promise<string | null> {
  return commands.readImageEmbeddedPrompt(imagePath)
}

export async function saveTempToolImage(
  bytes: number[] | Uint8Array,
  ext: string
): Promise<string> {
  return commands.saveTempToolImage(Array.from(bytes), ext)
}

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
