import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type Job = {
  id: string
  status: string
  kind: string
  paramsJson: string
  error: string | null
  createdAt: number
  updatedAt: number
}

export type GalleryItem = {
  id: string
  jobId: string | null
  path: string
  thumbnailPath: string | null
  metadataJson: string
  createdAt: number
}

export type MediaCategory = "image" | "video" | "audio"
export type StudioTab = MediaCategory | "creator" | "downloads"

export type GalleryRecipe = {
  blueprintId: string | null
  blueprintName: string | null
  category: MediaCategory
  runtime: string | null
  prompt: string
  values: Record<string, unknown>
}

/** Category for tab-scoped galleries. Defaults via metadata, then file extension. */
export function galleryItemCategory(item: GalleryItem): MediaCategory {
  const recipe = parseGalleryRecipe(item)
  if (recipe) return recipe.category
  const path = item.path.toLowerCase()
  if (/\.(mp4|webm|mov|mkv)$/i.test(path)) return "video"
  if (/\.(mp3|wav|flac|ogg|m4a|aac)$/i.test(path)) return "audio"
  return "image"
}

/** Parse regenerate settings from a gallery item, if present. */
export function parseGalleryRecipe(item: GalleryItem): GalleryRecipe | null {
  try {
    const meta = JSON.parse(item.metadataJson) as {
      blueprintId?: unknown
      blueprintName?: unknown
      category?: unknown
      runtime?: unknown
      prompt?: unknown
      values?: unknown
    }
    const values =
      meta.values &&
      typeof meta.values === "object" &&
      !Array.isArray(meta.values)
        ? { ...(meta.values as Record<string, unknown>) }
        : {}

    const promptFromMeta =
      typeof meta.prompt === "string" ? meta.prompt : undefined
    const promptFromValues =
      typeof values.prompt === "string" ? values.prompt : undefined
    const prompt = promptFromMeta ?? promptFromValues ?? ""

    const categoryRaw =
      typeof meta.category === "string" ? meta.category.toLowerCase() : ""
    const category: MediaCategory =
      categoryRaw === "video" ||
      categoryRaw === "audio" ||
      categoryRaw === "image"
        ? categoryRaw
        : "image"

    const blueprintId =
      typeof meta.blueprintId === "string" && meta.blueprintId
        ? meta.blueprintId
        : null

    if (!blueprintId && !prompt && Object.keys(values).length === 0) {
      return null
    }

    return {
      blueprintId,
      blueprintName:
        typeof meta.blueprintName === "string" ? meta.blueprintName : null,
      category,
      runtime: typeof meta.runtime === "string" ? meta.runtime : null,
      prompt,
      values,
    }
  } catch {
    return null
  }
}

export type GpuInfo = {
  available: boolean
  name: string | null
  memoryTotal: string | null
  driverVersion: string | null
  error: string | null
}

export type DownloadProgress = {
  url: string
  dest: string
  downloaded: number
  total: number | null
  done: boolean
  error: string | null
}

export type RuntimeInstall = {
  id: string
  engine: string
  version: string
  installPath: string
  port: number | null
  status: string
  error: string | null
  createdAt: number
  updatedAt: number
}

export type RuntimeProgress = {
  engine: string
  stage: string
  message: string
}

export type ComfyStatus = {
  processAlive: boolean
  healthy: boolean
  port: number
  runtime: RuntimeInstall | null
}

export type BlueprintSource = "official" | "user"

export type OfficialBlueprint = {
  id: string
  name: string
  category: string
  description: string
  runtime: string
  source: BlueprintSource
  minimumVramGb: number | null
  modelCount: number
  modelsReady: number
  totalSizeBytes: number | null
  localSizeBytes: number
  dir: string
  thumbnailPath: string | null
  /** True if any model URL is a gated Hugging Face repo. */
  requiresHfToken: boolean
  /** True if any model URL is from CivitAI (API key required). */
  requiresCivitaiToken: boolean
}

export type ModelProvider = "huggingFace" | "civitAi" | "direct"

export type ResolvedModelUrl = {
  provider: ModelProvider
  sourceUrl: string
  downloadUrl: string
  filename: string | null
  requiresAuth: boolean
}

/** Alias — Official + user blueprints share one shape. */
export type Blueprint = OfficialBlueprint

export type SuggestedModel = {
  filename: string
  path: string
  url: string
  /** Gated HF download — needs Settings → Hugging Face token. */
  gated: boolean
  /** Recipe model role (`unet`, `vae`, `checkpoint`, …). */
  role?: string
}

export type EmbeddedModel = {
  name: string
  url: string
  directory: string
}

export type CapturedWorkflow = {
  workflow: Record<string, unknown>
  embeddedModels: EmbeddedModel[]
}

export type SuggestedControl = {
  id: string
  type: string
  /** Empty when unbound — user must pick a Comfy input in Save dialog. */
  nodeId: string
  input: string
  label: string
  group: string
  default?: unknown
  include: boolean
  /** Required for the blueprint — locked in the Save dialog. */
  fixed: boolean
}

export type BindableInput = {
  nodeId: string
  input: string
  classType: string
  /** "number" | "string" | "boolean" */
  kind: string
  current: unknown
  title?: string | null
}

export type PackagingSuggestions = {
  models: SuggestedModel[]
  controls: SuggestedControl[]
  bindableInputs: BindableInput[]
}

export type BlueprintProgress = {
  blueprintId: string
  stage: string
  message: string
  modelIndex: number
  modelTotal: number
  /** Current model filename for download/skip stages. */
  filename?: string | null
  /** Overall bytes accounted for (completed models / offset before current file). */
  downloaded?: number | null
  /** Overall expected bytes for the install when known. */
  total?: number | null
}

export type BlueprintControl = {
  id: string
  type: string
  nodeId: string
  input: string
  label: string
  group: string
  default?: unknown
}

export type RecipeCapabilities = {
  negative: boolean
  loras: boolean
  controlnet: boolean
  upscale: boolean
}

export type BlueprintModelEntry = {
  filename: string
  path: string
  url: string
  sha256?: string | null
  gated?: boolean
  role?: string
  /** Present on getBlueprint detail — file already usable on disk. */
  ready?: boolean
}

export type BlueprintDetail = {
  id: string
  name: string
  category: string
  description: string
  runtime: string
  minimumVramGb: number | null
  modelCount: number
  modelsReady: number
  /** Synthesized from recipe arch / capabilities — not stored in manifest. */
  controls: BlueprintControl[]
  flowType?: string
  arch?: string
  capabilities?: RecipeCapabilities
  /** `"official"` | `"user"` */
  source?: BlueprintSource
  sampler?: string
  scheduler?: string
  models?: BlueprintModelEntry[]
  defaults?: Record<string, unknown>
}

export type JobProgress = {
  jobId: string
  stage: string
  message: string
  /** Sampler step (Comfy WS `progress`). */
  step?: number
  /** Sampler max steps. */
  max?: number
  /** Absolute path to latest latent preview JPEG/PNG (rewritten each frame). */
  previewPath?: string
}

export function gallerySrc(path: string): string {
  return convertFileSrc(path)
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  )
}

export async function listSettings(): Promise<Record<string, string>> {
  return invoke("list_settings")
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke("set_setting", { key, value })
}

export async function listJobs(): Promise<Job[]> {
  return invoke("list_jobs")
}

export async function createJob(
  kind: string,
  paramsJson?: string
): Promise<Job> {
  return invoke("create_job", { kind, paramsJson })
}

export async function updateJobStatus(
  id: string,
  status: string,
  error?: string | null
): Promise<Job> {
  return invoke("update_job_status", { id, status, error })
}

export async function listGallery(): Promise<GalleryItem[]> {
  return invoke("list_gallery")
}

export async function addGalleryItem(input: {
  path: string
  jobId?: string | null
  thumbnailPath?: string | null
  metadataJson?: string
}): Promise<GalleryItem> {
  return invoke("add_gallery_item", {
    path: input.path,
    jobId: input.jobId ?? null,
    thumbnailPath: input.thumbnailPath ?? null,
    metadataJson: input.metadataJson,
  })
}

export async function deleteGalleryItem(id: string): Promise<void> {
  return invoke("delete_gallery_item", { id })
}

export function onGalleryDeleted(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("gallery://deleted", (e) => handler(e.payload))
}

export async function detectGpu(): Promise<GpuInfo> {
  return invoke("detect_gpu")
}

export async function downloadUrl(
  url: string,
  relativePath: string,
  expectedSha256?: string
): Promise<string> {
  return invoke("download_url", {
    url,
    relativePath,
    expectedSha256,
  })
}

export function onJobsUpdated(
  handler: (job: Job) => void
): Promise<UnlistenFn> {
  return listen<Job>("jobs://updated", (e) => handler(e.payload))
}

export function onGalleryUpdated(
  handler: (item: GalleryItem) => void
): Promise<UnlistenFn> {
  return listen<GalleryItem>("gallery://updated", (e) => handler(e.payload))
}

export function onDownloadProgress(
  handler: (progress: DownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("downloads://progress", (e) =>
    handler(e.payload)
  )
}

export async function listRuntimes(): Promise<RuntimeInstall[]> {
  return invoke("list_runtimes")
}

export async function installComfyui(): Promise<RuntimeInstall> {
  return invoke("install_comfyui")
}

export async function startComfyui(): Promise<RuntimeInstall> {
  return invoke("start_comfyui")
}

export async function stopComfyui(): Promise<RuntimeInstall> {
  return invoke("stop_comfyui")
}

export async function comfyuiStatus(): Promise<ComfyStatus> {
  return invoke("comfyui_status")
}

export async function listOfficialBlueprints(): Promise<OfficialBlueprint[]> {
  return listBlueprints()
}

export async function listBlueprints(): Promise<Blueprint[]> {
  return invoke("list_blueprints")
}

/** Resolve a model page/file URL to a download URL + suggested filename. */
export async function resolveModelUrl(url: string): Promise<ResolvedModelUrl> {
  return invoke("resolve_model_url", { url })
}

export async function installOfficialBlueprint(id: string): Promise<void> {
  return invoke("install_official_blueprint", { id })
}

export async function cancelBlueprintInstall(): Promise<void> {
  return invoke("cancel_blueprint_install")
}

export type LoraVariantInfo = {
  arch: string
  filename: string
  path: string
  url: string
  ready: boolean
}

export type LoraPack = {
  id: string
  name: string
  description: string
  source: "official" | "user" | string
  triggerWords: string[]
  defaultStrength: number
  strengthMin: number
  strengthMax: number
  arches: string[]
  variants: LoraVariantInfo[]
  variantsReady: number
  variantCount: number
}

/** Selected LoRA for generate — host resolves id → filename for the blueprint arch. */
export type LoraStackEntry = {
  id: string
  strength: number
}

export type LoraProgress = {
  loraId: string
  arch: string
  stage: string
  message: string
  filename?: string
}

export async function listLoras(): Promise<LoraPack[]> {
  return invoke("list_loras")
}

export async function getLora(id: string): Promise<LoraPack> {
  return invoke("get_lora", { id })
}

export async function installLoraVariant(
  id: string,
  arch: string
): Promise<void> {
  return invoke("install_lora_variant", { id, arch })
}

export async function saveUserLora(input: {
  id: string
  name: string
  description?: string
  triggerWords?: string[]
  defaultStrength?: number
  strengthMin?: number
  strengthMax?: number
  variants: Array<{
    arch: string
    filename: string
    path?: string
    url: string
  }>
}): Promise<LoraPack> {
  return invoke("save_user_lora", { args: input })
}

export async function deleteUserLora(id: string): Promise<void> {
  return invoke("delete_user_lora", { id })
}

export function onLorasUpdated(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("loras://updated", (e) => handler(e.payload))
}

export function onLoraProgress(
  handler: (progress: LoraProgress) => void
): Promise<UnlistenFn> {
  return listen<LoraProgress>("loras://progress", (e) => handler(e.payload))
}

export type UpscaleKind = "sr" | "supir"

export type UpscaleModelInfo = {
  id: string
  name: string
  description: string
  filename: string
  url: string
  scale: number
  kind: UpscaleKind
  ready: boolean
}

/** Generate refine payload — host resolves modelId → filename. */
export type UpscaleGenerateValue = {
  modelId: string
  usdu: boolean
  filename?: string
  scale?: number
  kind?: UpscaleKind
  /** USDU enlarge factor — 2 or 4. */
  usduScale?: 2 | 4
  usduSteps?: number
  usduDenoise?: number
}

export function defaultUsduSteps(arch?: string | null): number {
  return arch === "krea2" || arch === "z-image" ? 8 : 12
}

export function defaultUsduDenoise(arch?: string | null): number {
  if (arch === "krea2" || arch === "z-image") return 0.15
  if (arch === "flux" || arch === "flux2") return 0.2
  return 0.25
}

export type UpscaleProgress = {
  modelId: string
  stage: string
  message: string
  filename?: string
}

export async function listUpscalers(): Promise<UpscaleModelInfo[]> {
  return invoke("list_upscalers")
}

export async function installUpscaler(id: string): Promise<void> {
  return invoke("install_upscaler", { id })
}

export async function ensureUsduNode(): Promise<void> {
  return invoke("ensure_usdu_node")
}

export async function usduNodeReady(): Promise<boolean> {
  return invoke("usdu_node_ready")
}

export async function ensureSupirNode(): Promise<void> {
  return invoke("ensure_supir_node")
}

export async function supirNodeReady(): Promise<boolean> {
  return invoke("supir_node_ready")
}

export function onUpscalersUpdated(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("upscale://updated", (e) => handler(e.payload))
}

export function onUpscaleProgress(
  handler: (progress: UpscaleProgress) => void
): Promise<UnlistenFn> {
  return listen<UpscaleProgress>("upscale://progress", (e) =>
    handler(e.payload)
  )
}

export type ModelFileEntry = {
  relativePath: string
  bytes: number
}

export async function listModelFiles(): Promise<ModelFileEntry[]> {
  return invoke("list_model_files")
}

export async function openModelsDir(): Promise<string> {
  return invoke("open_models_dir")
}

export async function getOfficialBlueprint(
  id: string
): Promise<BlueprintDetail> {
  return getBlueprint(id)
}

export async function getBlueprint(id: string): Promise<BlueprintDetail> {
  return invoke("get_blueprint", { id })
}

export async function saveUserBlueprint(input: {
  id: string
  name: string
  category: string
  description?: string
  runtime?: string
  models: Array<{
    filename: string
    path: string
    url: string
    gated?: boolean
    role?: string
  }>
  flowType?: string
  arch: string
  sampler?: string
  scheduler?: string
  capabilities?: RecipeCapabilities
  defaults?: Record<string, unknown>
}): Promise<string> {
  return invoke("save_user_blueprint", { args: input })
}

export async function deleteUserBlueprint(id: string): Promise<void> {
  return invoke("delete_user_blueprint", { id })
}

export async function openUserBlueprintsDir(): Promise<string> {
  return invoke("open_user_blueprints_dir")
}

/** Open an http(s) URL in the system default browser (Tauri webview blocks window.open). */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauri()) {
    window.open(url, "_blank", "noopener,noreferrer")
    return
  }
  return invoke("open_external_url", { url })
}

export async function creatorEnsureComfy(): Promise<string> {
  return invoke("creator_ensure_comfy")
}

export async function creatorOpenComfy(): Promise<string> {
  return invoke("creator_open_comfy")
}

export async function creatorCaptureWorkflow(): Promise<CapturedWorkflow> {
  return invoke("creator_capture_workflow")
}

export async function creatorSuggestPackaging(
  workflow: unknown,
  embeddedModels?: EmbeddedModel[]
): Promise<PackagingSuggestions> {
  return invoke("creator_suggest_packaging", {
    workflow,
    embeddedModels: embeddedModels ?? null,
  })
}

export async function generateImage(
  blueprintId: string,
  values: Record<string, unknown>
): Promise<Job> {
  return invoke("generate_image", { blueprintId, values })
}

export async function cancelJob(id: string): Promise<Job> {
  return invoke("cancel_job", { id })
}

export function onJobProgress(
  handler: (progress: JobProgress) => void
): Promise<UnlistenFn> {
  return listen<JobProgress>("jobs://progress", (e) => handler(e.payload))
}

export function onBlueprintProgress(
  handler: (progress: BlueprintProgress) => void
): Promise<UnlistenFn> {
  return listen<BlueprintProgress>("blueprints://progress", (e) =>
    handler(e.payload)
  )
}

export function onBlueprintsUpdated(
  handler: (blueprintId: string) => void
): Promise<UnlistenFn> {
  return listen<string>("blueprints://updated", (e) => handler(e.payload))
}

/** Fired when background remote size probes finish (or after install refresh). */
export function onBlueprintSizes(
  handler: (blueprints: OfficialBlueprint[]) => void
): Promise<UnlistenFn> {
  return listen<OfficialBlueprint[]>("blueprints://sizes", (e) =>
    handler(e.payload)
  )
}

/** Fired when a remote size probe starts / finishes (`stage`: start|done|error). */
export function onBlueprintProbe(
  handler: (progress: BlueprintProgress) => void
): Promise<UnlistenFn> {
  return listen<BlueprintProgress>("blueprints://probe", (e) =>
    handler(e.payload)
  )
}

export function onRuntimesUpdated(
  handler: (runtime: RuntimeInstall) => void
): Promise<UnlistenFn> {
  return listen<RuntimeInstall>("runtimes://updated", (e) => handler(e.payload))
}

export function onRuntimeProgress(
  handler: (progress: RuntimeProgress) => void
): Promise<UnlistenFn> {
  return listen<RuntimeProgress>("runtimes://progress", (e) =>
    handler(e.payload)
  )
}
