/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ openExternalUrl: vi.fn(async () => {}) })
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

import { HfTokenDialog } from "./hf-token-dialog"

describe("HfTokenDialog", () => {
  it("renders default and named blueprint copy", () => {
    const { rerender } = render(
      <HfTokenDialog open onOpenChange={() => {}} onConfirm={async () => {}} />
    )
    expect(
      screen.getByText(
        /This blueprint downloads gated models from Hugging Face/
      )
    ).toBeInTheDocument()
    expect(screen.getByText("Hugging Face token required")).toBeInTheDocument()

    rerender(
      <HfTokenDialog
        open
        onOpenChange={() => {}}
        blueprintName="Flux"
        onConfirm={async () => {}}
      />
    )
    expect(
      screen.getByText(/Flux downloads gated models from Hugging Face/)
    ).toBeInTheDocument()
  })
})
