/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const openExternalUrl = vi.hoisted(() => vi.fn(async () => {}))
const notifyError = vi.hoisted(() => vi.fn())

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ openExternalUrl })
})

vi.mock("@/lib/notify", () => ({
  notifyError,
  notify: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyProgress: vi.fn(),
  notifyDismiss: vi.fn(),
}))

import { GatedModelDialog } from "./gated-model-dialog"

describe("GatedModelDialog", () => {
  beforeEach(() => {
    openExternalUrl.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
  })

  it("lists repos, falls back to HF home, and confirms", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    const { rerender } = render(
      <GatedModelDialog
        open
        onOpenChange={() => {}}
        repos={[
          { id: "org/model", pageUrl: "https://huggingface.co/org/model" },
        ]}
        onConfirm={onConfirm}
      />
    )
    expect(
      screen.getByText(/This blueprint uses gated Hugging Face models/)
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /org\/model/i }))
    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://huggingface.co/org/model"
    )

    openExternalUrl.mockRejectedValueOnce(new Error("fail"))
    await user.click(screen.getByRole("button", { name: /org\/model/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("fail", "Could not open browser")
    )

    openExternalUrl.mockRejectedValueOnce("x")
    await user.click(screen.getByRole("button", { name: /org\/model/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("x", "Could not open browser")
    )

    rerender(
      <GatedModelDialog
        open
        onOpenChange={() => {}}
        blueprintName="Flux"
        repos={[]}
        onConfirm={onConfirm}
      />
    )
    expect(
      screen.getByText(/Flux uses gated Hugging Face models/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Open Hugging Face/i }))
    expect(openExternalUrl).toHaveBeenCalledWith("https://huggingface.co")

    let resolve!: () => void
    onConfirm.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolve = r
        })
    )
    await user.click(
      screen.getByRole("button", { name: /I've accepted - continue/i })
    )
    expect(screen.getByRole("button", { name: "Continuing…" })).toBeDisabled()
    resolve()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /I've accepted - continue/i })
      ).toBeEnabled()
    )
  })
})
