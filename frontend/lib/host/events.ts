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

export function onGalleryDeleted(
  handler: (id: string) => void
): Promise<UnlistenFn> {
  return listen<string>("gallery://deleted", (e) => handler(e.payload))
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

export function onDownloadManager(
  handler: (snapshot: DownloadSnapshot) => void
): Promise<UnlistenFn> {
  return listen<DownloadSnapshot>("downloads://manager", (e) =>
    handler(e.payload)
  )
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

export function onPromptToolsProgress(
  handler: (progress: PromptToolsProgress) => void
): Promise<UnlistenFn> {
  return listen<PromptToolsProgress>("prompt-tools://progress", (e) =>
    handler(e.payload)
  )
}

export function onJobProgress(
  handler: (progress: JobProgress) => void
): Promise<UnlistenFn> {
  return listen<JobProgress>("jobs://progress", (e) => handler(e.payload))
}

export function onJobQueue(
  handler: (snapshot: JobQueueSnapshot) => void
): Promise<UnlistenFn> {
  return listen<JobQueueSnapshot>("jobs://queue", (e) => handler(e.payload))
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
