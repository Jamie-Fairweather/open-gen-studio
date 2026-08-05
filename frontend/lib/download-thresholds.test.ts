import { describe, expect, it } from "vitest"
import { MIN_ETA_SPEED_BPS } from "./download-thresholds"

describe("MIN_ETA_SPEED_BPS", () => {
  it("is 8 KiB/s", () => {
    expect(MIN_ETA_SPEED_BPS).toBe(8 * 1024)
  })
})
