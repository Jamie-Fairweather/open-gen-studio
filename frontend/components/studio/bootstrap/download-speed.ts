export const SPEED_WINDOW_MS = 20_000
export const SPEED_MIN_MS = 5_000

type SpeedSample = { t: number; bytes: number; url: string }

export type DownloadProgressPayload = {
  done: boolean
  downloaded: number
  total: number | null | undefined
  url: string
}

/** Tracks download throughput with a sliding window + EMA for stable ETA display. */
export function createDownloadSpeedTracker(
  onSpeedChange: (bps: number) => void
) {
  let speedSamples: SpeedSample[] = []
  let emaSpeed = 0
  let publishedSpeed = 0

  return {
    getEmaSpeed: () => emaSpeed,
    update(p: DownloadProgressPayload) {
      const now = performance.now()
      const trackedBytes = p.downloaded
      if (p.done) {
        speedSamples = []
        emaSpeed = 0
        publishedSpeed = 0
        onSpeedChange(0)
        return
      }
      if (p.total == null || p.total <= trackedBytes) return

      // Keep EMA across files so overall ETA doesn't collapse between steps.
      if (speedSamples.length > 0 && speedSamples[0]!.url !== p.url) {
        speedSamples = []
      }
      speedSamples.push({ t: now, bytes: trackedBytes, url: p.url })
      const cutoff = now - SPEED_WINDOW_MS
      while (speedSamples.length > 1 && speedSamples[0]!.t < cutoff) {
        speedSamples.shift()
      }
      while (
        speedSamples.length > 1 &&
        speedSamples[speedSamples.length - 1]!.bytes < speedSamples[0]!.bytes
      ) {
        speedSamples.shift()
      }
      if (speedSamples.length >= 2) {
        const oldest = speedSamples[0]!
        const newest = speedSamples[speedSamples.length - 1]!
        const dtMs = newest.t - oldest.t
        if (dtMs >= SPEED_MIN_MS) {
          const windowSpeed = ((newest.bytes - oldest.bytes) / dtMs) * 1000
          emaSpeed =
            emaSpeed > 0 ? emaSpeed * 0.95 + windowSpeed * 0.05 : windowSpeed
          // Only publish meaningful changes - cuts UI thrash from tiny speed noise.
          const delta = Math.abs(emaSpeed - publishedSpeed)
          if (
            publishedSpeed === 0 ||
            delta / publishedSpeed > 0.06 ||
            delta > 256 * 1024
          ) {
            publishedSpeed = emaSpeed
            onSpeedChange(emaSpeed)
          }
        }
      }
    },
  }
}
