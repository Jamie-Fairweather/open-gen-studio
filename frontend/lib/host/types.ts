export type {
  BindableInput,
  Blueprint,
  BlueprintControl,
  BlueprintDetail,
  BlueprintProgress,
  CapturedWorkflow,
  ComfyStatus,
  DownloadJobView,
  DownloadProgress,
  DownloadSnapshot,
  DownloadSpec,
  DownloadStepView,
  EmbeddedModel,
  EnsureOpts,
  EnsureResult,
  GalleryItem,
  GpuInfo,
  Job,
  JobProgress,
  JobQueueItem,
  JobQueueSnapshot,
  LoraPack,
  LoraProgress,
  LoraVariantInfo,
  ModelFileEntry,
  PackagingSuggestions,
  PinStatus,
  PromptToolResult,
  PromptToolsProgress,
  PromptToolWeightInfo,
  RecipeCapabilities,
  ResolvedModelUrl,
  RuntimeInstall,
  RuntimePinsStatus,
  RuntimeProgress,
  SuggestedControl,
  SuggestedModel,
  UpscaleKind,
  UpscaleModelInfo,
  UpscaleProgress,
} from "@/lib/generated/bindings"

import type {
  Blueprint,
  BlueprintModelInfo,
  ProviderKind,
  UpscaleKind,
} from "@/lib/generated/bindings"

export type OfficialBlueprint = Blueprint
export type BlueprintModelEntry = BlueprintModelInfo
export type ModelProvider = ProviderKind

export type MediaCategory = "image" | "video" | "audio"
export type StudioTab = MediaCategory | "creator" | "downloads" | "tools"

/** In-memory handoff into Tools pages (not URL query - prompts can be large). */
export type ToolsHandoff = {
  imagePath?: string
  prompt?: string
  negative?: string
}

export type GalleryRecipe = {
  blueprintId: string | null
  blueprintName: string | null
  category: MediaCategory
  runtime: string | null
  prompt: string
  values: Record<string, unknown>
}

/** Narrowing helper - IPC stores source as string. */
export type BlueprintSource = "official" | "user"

/** Selected LoRA for generate - host resolves id → filename for the blueprint arch. */
export type LoraStackEntry = {
  id: string
  strength: number
}

/** Generate refine payload - host resolves modelId → filename. */
export type UpscaleGenerateValue = {
  modelId: string
  usdu: boolean
  filename?: string
  scale?: number
  kind?: UpscaleKind
  /** USDU enlarge factor - 2 or 4. */
  usduScale?: 2 | 4
  usduSteps?: number
  usduDenoise?: number
}
