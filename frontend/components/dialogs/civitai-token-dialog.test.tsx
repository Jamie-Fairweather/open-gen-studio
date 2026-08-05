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

import { CivitaiTokenDialog } from "./civitai-token-dialog"

describe("CivitaiTokenDialog", () => {
  it("renders default and named blueprint copy", () => {
    const { rerender } = render(
      <CivitaiTokenDialog
        open
        onOpenChange={() => {}}
        onConfirm={async () => {}}
      />
    )
    expect(
      screen.getByText(/This blueprint downloads models from CivitAI/)
    ).toBeInTheDocument()

    rerender(
      <CivitaiTokenDialog
        open
        onOpenChange={() => {}}
        blueprintName="RealVis"
        onConfirm={async () => {}}
      />
    )
    expect(
      screen.getByText(/RealVis downloads models from CivitAI/)
    ).toBeInTheDocument()
  })
})
