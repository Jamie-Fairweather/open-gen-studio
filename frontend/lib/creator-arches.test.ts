import { describe, expect, it } from "vitest"
import { ARCHES, ARCH_ITEMS, isArchId } from "./creator-arches"
import { RECIPE_ARCHES } from "./arch"

describe("creator-arches", () => {
  it("exports arch registry, select items, and isArchId", () => {
    expect(ARCHES.length).toBeGreaterThan(0)
    expect(ARCH_ITEMS).toEqual(
      ARCHES.map((a) => ({ label: a.label, value: a.id }))
    )
    for (const arch of ARCHES) {
      expect(isArchId(arch.id)).toBe(true)
      expect(arch.slots.length).toBeGreaterThan(0)
      expect(arch.defaults.width).toBeGreaterThan(0)
    }
    expect(isArchId("not-an-arch")).toBe(false)
    expect(ARCHES.every((a) => RECIPE_ARCHES.includes(a.id))).toBe(true)
  })
})
