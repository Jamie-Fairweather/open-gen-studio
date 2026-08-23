import type {
  PromptFormatId,
  PromptTargetId,
  StructuredFields,
} from "@/lib/prompt-tools"

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

export type PersistedPromptEnhance = {
  input: string
  result: string
  negative: string | null
  target: PromptTargetId
  mode: string
  styleLook: string
  seeded: boolean
}

export type ToolsSessionV1 = {
  toolsPath: string | null
  imageToPrompt: PersistedImageToPrompt
  promptEnhance: PersistedPromptEnhance
}

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
