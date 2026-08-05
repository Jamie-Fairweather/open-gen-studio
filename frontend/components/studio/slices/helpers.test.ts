import { describe, expect, it } from "vitest"
import {
  applySet,
  blueprintIdFromJobKey,
  computeActiveDetail,
  DEFAULT_UPSCALE_MODEL_ID,
  SETTING_STUDIO_SESSION,
} from "./helpers"

describe("helpers barrel", () => {
  it("re-exports slice helpers and constants", () => {
    expect(applySet(1, 2)).toBe(2)
    expect(blueprintIdFromJobKey("blueprint:x")).toBe("x")
    expect(computeActiveDetail(null, "a")).toBeNull()
    expect(DEFAULT_UPSCALE_MODEL_ID).toBe("4x-nomos2-hq-dat2")
    expect(SETTING_STUDIO_SESSION).toBe("ui_studio_session_v1")
  })
})
