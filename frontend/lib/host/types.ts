/** IPC DTOs from Rust (`bun run ipc:types`). Prefer these over importing bindings. */
export type {
  BindableInput,
  Blueprint,
  BlueprintControl,
  BlueprintDetail,
  BlueprintProgress,
  CapturedWorkflow,
  ComfyStatus,
  DataDirInfo,
  DownloadJobView,
  DownloadProgress,
  DownloadSnapshot,
  DownloadSpec,
  DownloadStepView,
  EmbeddedModel,
  EnsureOpts,
  EnsureResult,
  GalleryItem,
  GpuAdapter,
  GpuInfo,
  GpuVendor,
  NvidiaVariant,
  Job,
  JobHistoryItem,
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
  SetDataDirResult,
  SystemSpecs,
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

/** Official catalog row — same shape as `Blueprint`, source is always official. */
export type OfficialBlueprint = Blueprint
/** One model slot on a Blueprint (checkpoint / VAE / …). */
export type BlueprintModelEntry = BlueprintModelInfo
/** Download host (`huggingface` | `civitai` | …). */
export type ModelProvider = ProviderKind

/** Studio media tab — maps to recipe category. */
export type MediaCategory = "image" | "video" | "audio"
/** Top-level studio route, including non-media panels. */
export type StudioTab =
  MediaCategory | "creator" | "downloads" | "tools" | "settings"

/** In-memory handoff into Tools pages (not URL query - prompts can be large). */
export type ToolsHandoff = {
  imagePath?: string
  prompt?: string
  negative?: string
}

/** Recipe snapshot stored on a gallery item (replay / send-to-generate). */
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
