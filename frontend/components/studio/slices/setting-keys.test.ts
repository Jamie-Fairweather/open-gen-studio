import { describe, expect, it } from "vitest"
import {
  DEFAULT_UPSCALE_MODEL_ID,
  SETTING_ADVANCED_OPEN,
  SETTING_GALLERY_OPEN,
  SETTING_GPU_VENDOR,
  SETTING_NVIDIA_PORTABLE_OVERRIDE,
  SETTING_SELECTED_BLUEPRINT,
  SETTING_STUDIO_SESSION,
} from "./setting-keys"

describe("setting keys", () => {
  it("exports stable setting ids", () => {
    expect(DEFAULT_UPSCALE_MODEL_ID).toBe("4x-nomos2-hq-dat2")
    expect(SETTING_SELECTED_BLUEPRINT).toBe("selected_blueprint_id")
    expect(SETTING_GPU_VENDOR).toBe("gpu_vendor")
    expect(SETTING_NVIDIA_PORTABLE_OVERRIDE).toBe("nvidia_portable_override")
    expect(SETTING_GALLERY_OPEN).toBe("ui_gallery_open")
    expect(SETTING_ADVANCED_OPEN).toBe("ui_advanced_open")
    expect(SETTING_STUDIO_SESSION).toBe("ui_studio_session_v1")
  })
})
