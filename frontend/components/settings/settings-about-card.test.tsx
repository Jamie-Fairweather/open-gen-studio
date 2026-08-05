/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  APP_LEGAL,
  APP_LEGAL_PRIVACY_URL,
  APP_LEGAL_TERMS_URL,
  APP_VERSION_FALLBACK,
} from "@/lib/legal"

const openExternalUrl = vi.hoisted(() => vi.fn(async () => {}))
const isTauri = vi.hoisted(() => vi.fn(() => false))
const notifyError = vi.hoisted(() => vi.fn())
const getVersion = vi.hoisted(() => vi.fn(async () => "9.9.9"))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ openExternalUrl, isTauri })
})

vi.mock("@/lib/notify", () => ({
  notifyError,
  notify: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyProgress: vi.fn(),
  notifyDismiss: vi.fn(),
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => getVersion(),
}))

import { SettingsAboutCard } from "./settings-about-card"

describe("SettingsAboutCard", () => {
  beforeEach(() => {
    openExternalUrl.mockReset().mockResolvedValue(undefined)
    isTauri.mockReset().mockReturnValue(false)
    notifyError.mockReset()
    getVersion.mockReset().mockResolvedValue("9.9.9")
  })

  it("shows product, version, license, and opens legal links", async () => {
    const user = userEvent.setup()
    render(<SettingsAboutCard />)

    expect(screen.getByText("About")).toBeTruthy()
    await waitFor(() => {
      expect(
        screen.getByText(`${APP_LEGAL.name} · v${APP_VERSION_FALLBACK}`)
      ).toBeTruthy()
    })
    expect(
      screen.getByText(
        `© ${APP_LEGAL.operator}. Licensed under ${APP_LEGAL.licenseName}.`
      )
    ).toBeTruthy()

    await user.click(screen.getByRole("button", { name: "Privacy Policy" }))
    expect(openExternalUrl).toHaveBeenCalledWith(APP_LEGAL_PRIVACY_URL)

    await user.click(screen.getByRole("button", { name: "Terms of Use" }))
    expect(openExternalUrl).toHaveBeenCalledWith(APP_LEGAL_TERMS_URL)

    await user.click(screen.getByRole("button", { name: "License" }))
    expect(openExternalUrl).toHaveBeenCalledWith(APP_LEGAL.licenseUrl)

    await user.click(screen.getByRole("button", { name: "GitHub" }))
    expect(openExternalUrl).toHaveBeenCalledWith(APP_LEGAL.githubUrl)
  })

  it("uses Tauri getVersion when running in the desktop shell", async () => {
    isTauri.mockReturnValue(true)
    render(<SettingsAboutCard />)

    await waitFor(() => {
      expect(screen.getByText(`${APP_LEGAL.name} · v9.9.9`)).toBeTruthy()
    })
    expect(getVersion).toHaveBeenCalled()
  })

  it("falls back when Tauri getVersion fails", async () => {
    isTauri.mockReturnValue(true)
    getVersion.mockRejectedValueOnce(new Error("no ipc"))
    render(<SettingsAboutCard />)

    await waitFor(() => {
      expect(
        screen.getByText(`${APP_LEGAL.name} · v${APP_VERSION_FALLBACK}`)
      ).toBeTruthy()
    })
  })

  it("ignores a late Tauri version if unmounted", async () => {
    isTauri.mockReturnValue(true)
    let resolveVersion!: (value: string) => void
    getVersion.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveVersion = resolve
        })
    )
    const { unmount } = render(<SettingsAboutCard />)
    await waitFor(() => expect(getVersion).toHaveBeenCalled())
    expect(screen.queryByText(/· v/)).toBeNull()
    unmount()
    resolveVersion("1.2.3")
    await Promise.resolve()
    expect(screen.queryByText(`${APP_LEGAL.name} · v1.2.3`)).toBeNull()
  })

  it("notifies when the browser cannot open", async () => {
    const user = userEvent.setup()
    openExternalUrl.mockRejectedValueOnce(new Error("blocked"))
    render(<SettingsAboutCard />)

    await user.click(screen.getByRole("button", { name: "Privacy Policy" }))
    expect(notifyError).toHaveBeenCalledWith(
      "blocked",
      "Could not open browser"
    )
  })

  it("stringifies non-Error open failures", async () => {
    const user = userEvent.setup()
    openExternalUrl.mockRejectedValueOnce("nope")
    render(<SettingsAboutCard />)

    await user.click(screen.getByRole("button", { name: "License" }))
    expect(notifyError).toHaveBeenCalledWith("nope", "Could not open browser")
  })
})
