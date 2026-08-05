import { describe, expect, it } from "vitest"
import { isRecipeArch, RECIPE_ARCHES } from "./arch"

describe("isRecipeArch", () => {
  it("accepts known arches and rejects others", () => {
    expect(isRecipeArch(RECIPE_ARCHES[0])).toBe(true)
    expect(isRecipeArch("not-an-arch")).toBe(false)
  })
})
