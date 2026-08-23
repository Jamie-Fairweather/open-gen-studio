import { commands } from "@/lib/generated/bindings"
import type {
  DownloadSnapshot,
  DownloadSpec,
  EnsureOpts,
  EnsureResult,
} from "./types"

/** Download a URL into the models tree via `download_url`; optional SHA-256 check. */
export async function downloadUrl(
  url: string,
  relativePath: string,
  expectedSha256?: string
): Promise<string> {
  return commands.downloadUrl(url, relativePath, expectedSha256 ?? null)
}

/** Start or reuse a managed download via `ensure_download`. Defaults to `wait: false` (fire-and-forget). */
export async function ensureDownload(
  spec: DownloadSpec,
  opts?: EnsureOpts
): Promise<EnsureResult> {
  return commands.ensureDownload(spec, opts ?? { wait: false })
}

/** Current download-manager snapshot via `list_downloads`. */
export async function listDownloads(): Promise<DownloadSnapshot> {
  return commands.listDownloads()
}

/** Hold a managed download via `pause_download` without deleting the partial file. */
export async function pauseDownload(jobId: string): Promise<void> {
  await commands.pauseDownload(jobId)
}

/** Continue a paused download via `resume_download`. */
export async function resumeDownload(jobId: string): Promise<void> {
  await commands.resumeDownload(jobId)
}

/** Abort a managed download via `cancel_download` and drop the job. */
export async function cancelDownload(jobId: string): Promise<void> {
  await commands.cancelDownload(jobId)
}
