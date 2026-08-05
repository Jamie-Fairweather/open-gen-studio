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

import { TokenDialog } from "./token-dialog"

describe("TokenDialog", () => {
  beforeEach(() => {
    openExternalUrl.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
  })

  it("saves token via button and Enter; skips empty", async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn(async () => {})
    const onOpenChange = vi.fn()
    render(
      <TokenDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="Token"
        description="Desc"
        externalUrl="https://example.com"
        externalLabel="Open site"
        tokenLabel="Access token"
        tokenPlaceholder="paste…"
        footerHint="hint"
      />
    )

    const input = screen.getByPlaceholderText("paste…")
    await user.type(input, "{Enter}")
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(input, "  secret  ")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("secret"))

    onConfirm.mockClear()
    await user.clear(input)
    await user.type(input, "abc")
    await user.click(screen.getByRole("button", { name: "Save & download" }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("abc"))
  })

  it("opens external url and reports errors", async () => {
    const user = userEvent.setup()
    render(
      <TokenDialog
        open
        onOpenChange={() => {}}
        onConfirm={async () => {}}
        title="Token"
        description="Desc"
        externalUrl="https://example.com/t"
        externalLabel="Open site"
        tokenLabel="Access token"
        tokenPlaceholder="paste…"
        footerHint="hint"
      />
    )

    await user.click(screen.getByRole("button", { name: /Open site/i }))
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com/t")

    openExternalUrl.mockRejectedValueOnce(new Error("blocked"))
    await user.click(screen.getByRole("button", { name: /Open site/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        "blocked",
        "Could not open browser"
      )
    )

    openExternalUrl.mockRejectedValueOnce("nope")
    await user.click(screen.getByRole("button", { name: /Open site/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("nope", "Could not open browser")
    )
  })

  it("shows Saving… while confirm is in flight", async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r
        })
    )
    render(
      <TokenDialog
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        title="Busy token"
        description="Desc"
        externalUrl="https://example.com"
        externalLabel="Open site"
        tokenLabel="Access token"
        tokenPlaceholder="busy-paste…"
        footerHint="hint"
      />
    )
    await user.type(screen.getByPlaceholderText("busy-paste…"), "tok")
    await user.click(screen.getByRole("button", { name: "Save & download" }))
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()
    resolve()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save & download" })
      ).toBeEnabled()
    )
  })
})
