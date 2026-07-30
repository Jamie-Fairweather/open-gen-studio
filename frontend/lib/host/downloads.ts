import { commands } from "@/lib/generated/bindings"
import type {
  DownloadSnapshot,
  DownloadSpec,
  EnsureOpts,
  EnsureResult,
} from "./types"

export async function downloadUrl(
  url: string,
  relativePath: string,
  expectedSha256?: string
): Promise<string> {
  return commands.downloadUrl(url, relativePath, expectedSha256 ?? null)
}

export async function ensureDownload(
  spec: DownloadSpec,
  opts?: EnsureOpts
): Promise<EnsureResult> {
  return commands.ensureDownload(spec, opts ?? { wait: false })
}

export async function listDownloads(): Promise<DownloadSnapshot> {
  return commands.listDownloads()
}

export async function pauseDownload(jobId: string): Promise<void> {
  await commands.pauseDownload(jobId)
}

export async function resumeDownload(jobId: string): Promise<void> {
  await commands.resumeDownload(jobId)
}

export async function cancelDownload(jobId: string): Promise<void> {
  await commands.cancelDownload(jobId)
}
