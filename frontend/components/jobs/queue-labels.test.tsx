import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import type { JobQueueItem } from "@/lib/host"
import { KindGlyph, kindLabel, statusLabel, statusTone } from "./queue-labels"

const item = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "Gen",
  status: "queued",
  prompt: null,
  meta: null,
  ...partial,
})

describe("queue-labels", () => {
  it("kindLabel covers known and unknown kinds", () => {
    expect(kindLabel("generate")).toBe("Generate")
    expect(kindLabel("prompt-tool")).toBe("Prompt Tools")
    expect(kindLabel("other")).toBe("other")
  })

  it("statusLabel covers running/paused/waiting", () => {
    expect(statusLabel(item({ status: "running" }), "1/10")).toBe("1/10")
    expect(statusLabel(item({ status: "running" }), null)).toBe("Running")
    expect(statusLabel(item({ status: "paused" }), null)).toBe("Paused")
    expect(statusLabel(item({ status: "queued" }), null)).toBe("Waiting")
  })

  it("statusTone covers completed/failed/cancelled/default", () => {
    expect(statusTone("completed")).toContain("emerald")
    expect(statusTone("failed")).toContain("destructive")
    expect(statusTone("cancelled")).toContain("destructive")
    expect(statusTone("queued")).toContain("muted")
  })

  it("KindGlyph picks icons by kind", () => {
    const { container, rerender } = render(<KindGlyph kind="generate" />)
    expect(container.querySelector("svg")).toBeTruthy()
    rerender(<KindGlyph kind="prompt-tool" />)
    expect(container.querySelector("svg")).toBeTruthy()
    expect(screen.queryByRole("img")).toBeNull()
  })
})
