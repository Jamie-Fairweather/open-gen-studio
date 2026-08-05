import { describe, expect, it } from "vitest"
import {
  blueprintIdFromJobKey,
  isPromptToolsJobKey,
  loraKeyFromJobKey,
  promptToolsModelIdFromJobKey,
  upscaleIdFromJobKey,
} from "./job-keys"

describe("job key parsers", () => {
  it("strips known prefixes and rejects others", () => {
    expect(blueprintIdFromJobKey("blueprint:abc")).toBe("abc")
    expect(blueprintIdFromJobKey("other")).toBeNull()
    expect(loraKeyFromJobKey("lora:pack:v1")).toBe("pack:v1")
    expect(loraKeyFromJobKey("x")).toBeNull()
    expect(upscaleIdFromJobKey("upscale:m1")).toBe("m1")
    expect(upscaleIdFromJobKey("x")).toBeNull()
    expect(promptToolsModelIdFromJobKey("prompt-tools:qwen")).toBe("qwen")
    expect(promptToolsModelIdFromJobKey("x")).toBeNull()
    expect(isPromptToolsJobKey("prompt-tools:x")).toBe(true)
    expect(isPromptToolsJobKey("blueprint:x")).toBe(false)
  })
})
