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

import { SettingsTokenCard } from "./settings-token-card"

const base = {
  title: "Hugging Face",
  description: "desc",
  savedLabel: "Token saved on this device",
  token: "",
  onTokenChange: vi.fn(),
  dirty: false,
  saving: false,
  onSave: vi.fn(),
  onClear: vi.fn(),
  fieldLabel: "Access token",
  placeholderUnset: "hf_…",
  placeholderReplace: "Enter new token to replace…",
  saveLabel: "Save token",
  savingLabel: "Saving…",
  externalLabel: "Get a token",
  externalUrl: "https://huggingface.co/settings/tokens",
}

describe("SettingsTokenCard", () => {
  beforeEach(() => {
    openExternalUrl.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
  })

  it("handles unset/set states, save, clear, and external link errors", async () => {
    const user = userEvent.setup()
    const onTokenChange = vi.fn()
    const onSave = vi.fn()
    const onClear = vi.fn()
    const { rerender } = render(
      <SettingsTokenCard
        {...base}
        hasToken={false}
        onTokenChange={onTokenChange}
        onSave={onSave}
        onClear={onClear}
      />
    )
    expect(screen.getByText("Not set")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("hf_…")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull()

    await user.type(screen.getByPlaceholderText("hf_…"), "abc")
    expect(onTokenChange).toHaveBeenCalled()

    rerender(
      <SettingsTokenCard
        {...base}
        hasToken
        token="x"
        dirty
        saving
        onTokenChange={onTokenChange}
        onSave={onSave}
        onClear={onClear}
      />
    )
    expect(screen.getByText("Token saved on this device")).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText("Enter new token to replace…")
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()

    rerender(
      <SettingsTokenCard
        {...base}
        hasToken
        token="tok"
        dirty
        onTokenChange={onTokenChange}
        onSave={onSave}
        onClear={onClear}
      />
    )
    await user.click(screen.getByRole("button", { name: "Save token" }))
    expect(onSave).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(onClear).toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Get a token" }))
    expect(openExternalUrl).toHaveBeenCalledWith(base.externalUrl)

    openExternalUrl.mockRejectedValueOnce(new Error("boom"))
    await user.click(screen.getByRole("button", { name: "Get a token" }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("boom", "Could not open browser")
    )

    openExternalUrl.mockRejectedValueOnce(42)
    await user.click(screen.getByRole("button", { name: "Get a token" }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("42", "Could not open browser")
    )
  })
})
