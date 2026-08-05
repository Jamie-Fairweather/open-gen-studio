import { describe, expect, it } from "vitest"
import { formatBytes, formatDuration, formatEta } from "./format"

describe("formatBytes", () => {
  it("formats byte boundaries", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1023)).toBe("1023 B")
    expect(formatBytes(1024)).toBe("1.0 KB")
    expect(formatBytes(1024 ** 2)).toBe("1.0 MB")
    expect(formatBytes(1024 ** 3)).toBe("1.00 GB")
  })
})

describe("formatDuration", () => {
  it("returns dash for invalid input", () => {
    expect(formatDuration(Number.NaN)).toBe("-")
    expect(formatDuration(-1)).toBe("-")
  })

  it("buckets seconds, minutes, and hours", () => {
    expect(formatDuration(0.2)).toBe("1s")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(60)).toBe("1m")
    expect(formatDuration(61)).toBe("1m 1s")
    expect(formatDuration(3600)).toBe("1h")
    expect(formatDuration(3660)).toBe("1h 1m")
  })
})

describe("formatEta", () => {
  it("returns dash for invalid input", () => {
    expect(formatEta(Number.NaN)).toBe("-")
    expect(formatEta(-5)).toBe("-")
  })

  it("uses coarse buckets under 90s and minutes thereafter", () => {
    expect(formatEta(3)).toBe("~5s")
    expect(formatEta(12)).toBe("~15s")
    expect(formatEta(120)).toBe("~2m")
    expect(formatEta(3600)).toBe("~1h")
    expect(formatEta(3660)).toBe("~1h 1m")
  })
})
