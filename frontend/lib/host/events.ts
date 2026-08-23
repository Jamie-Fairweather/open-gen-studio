import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type {
  BlueprintProgress,
  DownloadProgress,
  DownloadSnapshot,
  GalleryItem,
  Job,
  JobProgress,
  JobQueueSnapshot,
  LoraProgress,
  OfficialBlueprint,
  PromptToolsProgress,
  RuntimeInstall,
  RuntimeProgress,
  UpscaleProgress,
} from "./types"

/** Fired on `gallery://deleted` after a gallery item is removed. */
export function onGalleryDeleted(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("gallery://deleted", (e) => handler(e.payload))
}

/** Fired on `jobs://updated` when a single job's status or fields change. */
export function onJobsUpdated(
  handler: (job: Job) => void
): Promise<UnlistenFn> {
  return listen<Job>("jobs://updated", (e) => handler(e.payload))
}

/** Fired on `gallery://updated` when a gallery item is added or rewritten. */
export function onGalleryUpdated(
  handler: (item: GalleryItem) => void
): Promise<UnlistenFn> {
  return listen<GalleryItem>("gallery://updated", (e) => handler(e.payload))
}

/** Byte-level download ticks via `downloads://progress`. */
export function onDownloadProgress(
  handler: (progress: DownloadProgress) => void
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("downloads://progress", (e) =>
    handler(e.payload)
  )
}

/** Full download-manager snapshot via `downloads://manager`. */
export function onDownloadManager(
  handler: (snapshot: DownloadSnapshot) => void
): Promise<UnlistenFn> {
  return listen<DownloadSnapshot>("downloads://manager", (e) =>
    handler(e.payload)
  )
}

/** Fired on `loras://updated` when a LoRA pack is installed, saved, or removed. */
export function onLorasUpdated(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("loras://updated", (e) => handler(e.payload))
}

/** Install-weight progress for a LoRA variant via `loras://progress`. */
export function onLoraProgress(
  handler: (progress: LoraProgress) => void
): Promise<UnlistenFn> {
  return listen<LoraProgress>("loras://progress", (e) => handler(e.payload))
}

/** Fired on `upscale://updated` when an upscale model is installed or removed. */
export function onUpscalersUpdated(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("upscale://updated", (e) => handler(e.payload))
}

/** Upscale-weight download ticks via `upscale://progress`. */
export function onUpscaleProgress(
  handler: (progress: UpscaleProgress) => void
): Promise<UnlistenFn> {
  return listen<UpscaleProgress>("upscale://progress", (e) =>
    handler(e.payload)
  )
}

/** Prompt-tools provider install ticks via `prompt-tools://progress`. */
export function onPromptToolsProgress(
  handler: (progress: PromptToolsProgress) => void
): Promise<UnlistenFn> {
  return listen<PromptToolsProgress>("prompt-tools://progress", (e) =>
    handler(e.payload)
  )
}

/** Step / preview ticks for a running job via `jobs://progress`. */
export function onJobProgress(
  handler: (progress: JobProgress) => void
): Promise<UnlistenFn> {
  return listen<JobProgress>("jobs://progress", (e) => handler(e.payload))
}

/** GPU-queue snapshot via `jobs://queue`. */
export function onJobQueue(
  handler: (snapshot: JobQueueSnapshot) => void
): Promise<UnlistenFn> {
  return listen<JobQueueSnapshot>("jobs://queue", (e) => handler(e.payload))
}

/** Fired on `jobs://history` when history changes (no payload). */
export function onJobHistory(handler: () => void): Promise<UnlistenFn> {
  return listen("jobs://history", () => handler())
}

/** Official-blueprint install ticks via `blueprints://progress`. */
export function onBlueprintProgress(
  handler: (progress: BlueprintProgress) => void
): Promise<UnlistenFn> {
  return listen<BlueprintProgress>("blueprints://progress", (e) =>
    handler(e.payload)
  )
}

/** Fired on `blueprints://updated` when a pack is installed, saved, or removed. */
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

/** Fired on `runtimes://updated` when a runtime install record changes. */
export function onRuntimesUpdated(
  handler: (runtime: RuntimeInstall) => void
): Promise<UnlistenFn> {
  return listen<RuntimeInstall>("runtimes://updated", (e) => handler(e.payload))
}

/** Runtime install / start ticks via `runtimes://progress`. */
export function onRuntimeProgress(
  handler: (progress: RuntimeProgress) => void
): Promise<UnlistenFn> {
  return listen<RuntimeProgress>("runtimes://progress", (e) =>
    handler(e.payload)
  )
}

/** Tauri `data-dir://progress` payload; `stage` is a free string from the host move. */
export type DataDirProgress = {
  stage: string
  message: string
  current: number
  total: number
}

/** Data-directory move ticks via `data-dir://progress`. */
export function onDataDirProgress(
  handler: (progress: DataDirProgress) => void
): Promise<UnlistenFn> {
  return listen<DataDirProgress>("data-dir://progress", (e) =>
    handler(e.payload)
  )
}

/** Fired on `data-dir://close-blocked` when quit is refused mid-move. */
export function onDataDirCloseBlocked(
  handler: (message: string) => void
): Promise<UnlistenFn> {
  return listen<string>("data-dir://close-blocked", (e) => handler(e.payload))
}
