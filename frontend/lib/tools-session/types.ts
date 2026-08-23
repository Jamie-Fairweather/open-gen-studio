import type {
  PromptFormatId,
  PromptTargetId,
  StructuredFields,
} from "@/lib/prompt-tools"

/** Image-to-prompt fields written to the tools session file. */
export type PersistedImageToPrompt = {
  imagePath: string | null
  previewUrl: string | null
  format: PromptFormatId
  target: PromptTargetId
  result: string
  negative: string | null
  fields: StructuredFields | null
  galleryOpen: boolean
}

/** Prompt-enhance fields written to the tools session file. */
export type PersistedPromptEnhance = {
  input: string
  result: string
  negative: string | null
  target: PromptTargetId
  mode: string
  styleLook: string
  seeded: boolean
}

/** On-disk tools session (v1). `toolsPath` is the last Tools route. */
export type ToolsSessionV1 = {
  toolsPath: string | null
  imageToPrompt: PersistedImageToPrompt
  promptEnhance: PersistedPromptEnhance
}

/** Live store slice `serializeToolsSession` reads (same fields, not versioned). */
export type ToolsSessionSource = {
  imageToPrompt: {
    imagePath: string | null
    previewUrl: string | null
    format: PromptFormatId
    target: PromptTargetId
    result: string
    negative: string | null
    fields: StructuredFields | null
    galleryOpen: boolean
  }
  promptEnhance: {
    input: string
    result: string
    negative: string | null
    target: PromptTargetId
    mode: string
    styleLook: string
    seeded: boolean
  }
}
