/** Human size for catalog / download rows (1024-based). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

/** Elapsed/remaining as `45s` / `3m 12s` / `1h 5m`; invalid → `-`. */
export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "-"
  if (secs < 60) return `${Math.max(1, Math.ceil(secs))}s`
  const m = Math.floor(secs / 60)
  const s = Math.ceil(secs % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

/** Coarser buckets so download ETAs don't flicker every tick. */
export function formatEta(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "-"
  if (secs < 90) {
    const bucket = Math.max(5, Math.ceil(secs / 5) * 5)
    return `~${bucket}s`
  }
  if (secs < 60 * 50) {
    return `~${Math.max(1, Math.round(secs / 60))}m`
  }
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`
}
