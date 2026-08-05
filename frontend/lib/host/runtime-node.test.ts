/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/generated/bindings", () => ({
  commands: {},
}))

import { isTauri } from "./runtime"

describe("isTauri (node)", () => {
  it("is false when window is undefined", () => {
    expect(typeof window).toBe("undefined")
    expect(isTauri()).toBe(false)
  })
})
