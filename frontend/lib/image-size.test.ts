import { describe, expect, it } from "vitest"
import {
  aspectIdFromSize,
  clampSideLength,
  roundTo,
  SIDE_LENGTH_DEFAULT,
  SIDE_LENGTH_MAX,
  SIDE_LENGTH_MIN,
  sideLengthFromSize,
  sizeFromAspectAndSide,
  syncSizeControls,
} from "./image-size"

describe("roundTo", () => {
  it("rounds to multiples and handles non-positive multiple", () => {
    expect(roundTo(70, 64)).toBe(64)
    expect(roundTo(10.4, 0)).toBe(10)
    expect(roundTo(10.6, -1)).toBe(11)
  })
})

describe("clampSideLength", () => {
  it("clamps and snaps to step", () => {
    expect(clampSideLength(0)).toBe(SIDE_LENGTH_MIN)
    expect(clampSideLength(99999)).toBe(SIDE_LENGTH_MAX)
    expect(clampSideLength(1000)).toBe(1024)
  })
})

describe("sizeFromAspectAndSide", () => {
  it("computes size and falls back for unknown aspect", () => {
    expect(sizeFromAspectAndSide("1:1", 1024)).toEqual({
      width: 1024,
      height: 1024,
    })
    const fallback = sizeFromAspectAndSide("nope", 1024)
    expect(fallback.width).toBe(1024)
    expect(fallback.height).toBe(1024)
  })
})

describe("aspectIdFromSize / sideLengthFromSize / syncSizeControls", () => {
  it("maps size to closest aspect and side, with defaults for invalid", () => {
    expect(aspectIdFromSize(1920, 1080)).toBe("16:9")
    expect(aspectIdFromSize(0, 10)).toBe("1:1")
    expect(sideLengthFromSize(1024, 1024)).toBe(1024)
    expect(sideLengthFromSize(-1, 10)).toBe(SIDE_LENGTH_DEFAULT)
    expect(syncSizeControls(1920, 1080)).toEqual({
      aspectId: "16:9",
      sideLength: sideLengthFromSize(1920, 1080),
    })
  })
})
