import type { DownloadSpec, EnsureResult } from "@/lib/host"
import type { CatalogInstallHost, CatalogRow } from "./types"

export function downloadSpecFor(
  row: Exclude<CatalogRow, { kind: "runtime" }>
): DownloadSpec {
  switch (row.kind) {
    case "blueprint":
      return { kind: "blueprint", id: row.id }
    case "lora":
      return { kind: "lora", id: row.id, arch: row.arch }
    case "upscale":
      return { kind: "upscale", id: row.id }
    case "promptTools":
      return { kind: "promptTools", provider: row.provider }
  }
}

export async function startCatalogInstall(
  row: CatalogRow,
  host: CatalogInstallHost
): Promise<EnsureResult> {
  if (row.kind === "runtime") {
    await host.installRuntime()
    return { status: "runtime", jobId: null, message: null }
  }
  return host.ensureDownload(downloadSpecFor(row), { wait: false })
}
