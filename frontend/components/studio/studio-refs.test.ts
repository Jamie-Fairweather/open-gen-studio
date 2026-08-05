import { describe, expect, it } from "vitest"
import { defaultNavigateTab, defaultPushPath, studioRefs } from "./studio-refs"

describe("studioRefs defaults", () => {
  it("exposes callable default navigation noops", () => {
    expect(() => defaultNavigateTab("image")).not.toThrow()
    expect(() => defaultPushPath("/")).not.toThrow()
    expect(studioRefs.navigateTab).toBeTypeOf("function")
    expect(studioRefs.pushPath).toBeTypeOf("function")
  })
})
