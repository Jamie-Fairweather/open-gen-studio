import { describe, expect, it } from "vitest"
import { applySet } from "./apply-set"

describe("applySet", () => {
  it("applies value or updater function", () => {
    expect(applySet(1, 2)).toBe(2)
    expect(applySet(1, (n) => n + 3)).toBe(4)
  })
})
