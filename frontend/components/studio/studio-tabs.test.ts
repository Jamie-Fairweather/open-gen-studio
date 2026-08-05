import { describe, expect, it } from "vitest"
import {
  MEDIA_TABS,
  SETTINGS_TAB,
  STUDIO_TABS,
  UTILITY_TABS,
  tabFromPath,
} from "./studio-tabs"

describe("studio-tabs", () => {
  it("exports tabs and maps path segments", () => {
    expect(MEDIA_TABS.length).toBe(3)
    expect(UTILITY_TABS.length).toBe(3)
    expect(SETTINGS_TAB.id).toBe("settings")
    expect(STUDIO_TABS.length).toBe(7)
    expect(tabFromPath("/")).toBe("image")
    expect(tabFromPath("/video")).toBe("video")
    expect(tabFromPath("/audio/x")).toBe("audio")
    expect(tabFromPath("/creator")).toBe("creator")
    expect(tabFromPath("/downloads")).toBe("downloads")
    expect(tabFromPath("/tools")).toBe("tools")
    expect(tabFromPath("/settings")).toBe("settings")
  })
})
