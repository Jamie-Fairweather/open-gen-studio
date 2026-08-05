/** Shared Format × Target helpers for Prompt Tools UI. */

import type { PromptFormat, PromptTarget } from "@/lib/generated/bindings"
import { isRecipeArch } from "@/lib/arch"

export type PromptFormatId = PromptFormat
export type PromptTargetId = PromptTarget

export const PROMPT_FORMATS: {
  id: PromptFormatId
  label: string
}[] = [
  { id: "general", label: "General" },
  { id: "structured", label: "Structured" },
  { id: "graphicDesign", label: "Graphic design" },
  { id: "json", label: "JSON" },
]

export const PROMPT_TARGETS: {
  id: PromptTargetId
  label: string
}[] = [
  { id: "auto", label: "Auto" },
  { id: "flux", label: "Flux" },
  { id: "stableDiffusion", label: "Stable Diffusion" },
  { id: "ideogram", label: "Ideogram" },
  { id: "qwenImage", label: "Qwen Image" },
  { id: "zImageKrea", label: "Z-Image / Krea" },
]

export const ENHANCE_MODES: { id: string; label: string }[] = [
  { id: "expand", label: "Expand" },
  { id: "clean", label: "Clean" },
  { id: "style", label: "Style" },
  { id: "composition", label: "Composition" },
  { id: "concrete", label: "More concrete" },
  { id: "lighting", label: "Lighting / camera" },
  { id: "tags", label: "Tag-dense" },
  { id: "short", label: "Keep short" },
]

/** Preset looks when Mode = Style (encoded as mode `style:<id>`). */
export const STYLE_LOOKS: { id: string; label: string }[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "product", label: "Product" },
  { id: "portrait", label: "Portrait" },
]

export function enhanceModePayload(
  mode: string,
  styleLook: string = "cinematic"
): string {
  if (mode === "style") return `style:${styleLook || "cinematic"}`
  return mode
}

export const STRUCTURED_FIELDS = [
  "Subject",
  "Setting",
  "Style",
  "Lighting",
  "Camera",
  "Mood",
  "Colors",
  "Details",
] as const

export type StructuredFields = Record<
  (typeof STRUCTURED_FIELDS)[number],
  string
>

export function emptyStructuredFields(): StructuredFields {
  return {
    Subject: "",
    Setting: "",
    Style: "",
    Lighting: "",
    Camera: "",
    Mood: "",
    Colors: "",
    Details: "",
  }
}

/** Parse labeled sections or JSON into field editors. */
export function parseStructuredPrompt(text: string): StructuredFields | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>
      const fields = emptyStructuredFields()
      const map: Record<string, keyof StructuredFields> = {
        subject: "Subject",
        setting: "Setting",
        style: "Style",
        lighting: "Lighting",
        camera: "Camera",
        mood: "Mood",
        colors: "Colors",
        details: "Details",
      }
      let hit = false
      for (const [k, field] of Object.entries(map)) {
        const v = obj[k]
        if (typeof v === "string" && v.trim()) {
          fields[field] = v.trim()
          hit = true
        } else if (Array.isArray(v)) {
          fields[field] = v.map(String).join(", ")
          hit = true
        }
      }
      return hit ? fields : null
    } catch {
      /* fall through to labeled parse */
    }
  }

  const fields = emptyStructuredFields()
  let hit = false
  const re =
    /^(Subject|Setting|Style|Lighting|Camera|Mood|Colors|Details)\s*:\s*(.*)$/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(trimmed)) !== null) {
    const label = STRUCTURED_FIELDS.find(
      (f) => f.toLowerCase() === m![1].toLowerCase()
    )!
    fields[label] = m[2].trim()
    hit = true
  }
  return hit ? fields : null
}

export function flattenStructuredFields(fields: StructuredFields): string {
  return STRUCTURED_FIELDS.filter((k) => fields[k].trim())
    .map((k) => `${k}: ${fields[k].trim()}`)
    .join("\n")
}

export function targetFromArch(arch?: string | null): PromptTargetId {
  if (!arch || !isRecipeArch(arch)) {
    const a = (arch ?? "").toLowerCase()
    if (a === "sd") return "stableDiffusion"
    if (a === "ideogram") return "ideogram"
    if (a === "krea") return "zImageKrea"
    if (a === "qwen" || a === "qwen-image") return "qwenImage"
    return "auto"
  }
  switch (arch) {
    case "flux":
    case "flux2":
    case "chroma":
      return "flux"
    case "sdxl":
    case "sd15":
    case "pony":
    case "illustrious":
    case "sd3.5":
      return "stableDiffusion"
    case "ideogram4":
      return "ideogram"
    case "qwen-image":
      return "qwenImage"
    case "z-image":
    case "krea2":
      return "zImageKrea"
  }
}
