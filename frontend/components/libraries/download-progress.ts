import type { DownloadJobView } from "@/lib/host"

/**
 * Soften technical install status lines (git SHAs, repo folder names) for UI.
 * Keeps already-plain messages unchanged.
 */
export function friendlyInstallStatus(
  message: string | null | undefined
): string | null {
  if (message == null) return null
  const m = message.trim()
  if (!m) return null
  // Drop power-user restart advice (noise on first-run / mid-install).
  if (/restart\s+ComfyUI/i.test(m)) {
    const cleaned = m
      .replace(/\s*[—\-]\s*restart\s+ComfyUI.*$/i, "")
      .replace(/\s+ready at\s+[0-9a-f]{7,40}\b/i, " ready")
      .trim()
    return cleaned || "Extensions ready"
  }
  if (/to pin\s+[0-9a-f]/i.test(m) || /Updating\s+ComfyUI-/i.test(m)) {
    return "Installing extensions…"
  }
  if (/Python dependencies/i.test(m)) {
    return "Installing Python dependencies…"
  }
  if (
    /Ensuring\s+ComfyUI-/i.test(m) ||
    /ComfyUI-Manager/i.test(m) ||
    /custom node/i.test(m)
  ) {
    return /ready/i.test(m) ? "Extensions ready" : "Installing extensions…"
  }
  // "ComfyUI-Foo ready at abc1234" → drop the hash noise
  const withoutSha = m.replace(/\s+ready at\s+[0-9a-f]{7,40}\b/i, " ready")
  if (withoutSha !== m) return withoutSha
  return m
}

export function statusLabel(status: string): string {
  if (status === "done") return "Ready"
  if (status === "error") return "Failed"
  if (status === "cancelled") return "Cancelled"
  if (status === "paused") return "Paused"
  if (status === "running") return "Running"
  return "Waiting"
}

export function jobPct(job: DownloadJobView): number | null {
  const active = job.steps.find(
    (s) => s.status === "running" || s.status === "paused"
  )
  // Non-transfer steps (extract/configure/extensions) stay indeterminate —
  // don't keep showing the finished download %.
  if (active && active.stepKind !== "http") return null
  if (job.total != null && job.total > 0) {
    return Math.min(100, (job.downloaded / job.total) * 100)
  }
  if (active?.bytesTotal && active.bytesTotal > 0) {
    return Math.min(100, (active.bytesDone / active.bytesTotal) * 100)
  }
  return null
}

export function formatPct(pct: number): string {
  return `${Math.min(100, pct).toFixed(2)}%`
}

/** Parse "Extracting… 20%" style progress from the live status line. */
export function detailPct(detail: string | null | undefined): number | null {
  if (!detail) return null
  const m = detail.match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}

export function stepStatusIcon(status: string) {
  if (status === "done") return "✓"
  if (status === "error") return "!"
  if (status === "running" || status === "paused") return "●"
  return "○"
}
