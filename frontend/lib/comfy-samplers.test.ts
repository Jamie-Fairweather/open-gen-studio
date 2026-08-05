import { describe, expect, it } from "vitest"
import {
  COMFY_SAMPLER_ITEMS,
  COMFY_SCHEDULER_ITEMS,
  comfyChoiceLabel,
} from "./comfy-samplers"

describe("comfyChoiceLabel", () => {
  it("uses overrides and title-cases unknown ids", () => {
    expect(comfyChoiceLabel("euler")).toBe("Euler")
    expect(comfyChoiceLabel("custom_sampler_x")).toBe("Custom Sampler X")
  })
})

describe("choice lists", () => {
  it("builds sampler and scheduler items", () => {
    expect(COMFY_SAMPLER_ITEMS[0]).toEqual({
      value: "euler",
      label: "Euler",
    })
    expect(COMFY_SCHEDULER_ITEMS.find((i) => i.value === "karras")?.label).toBe(
      "Karras"
    )
  })
})
