/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SettingsModelsCard } from "./settings-models-card"

describe("SettingsModelsCard", () => {
  it("browses models", async () => {
    const user = userEvent.setup()
    const onBrowseModels = vi.fn()
    render(<SettingsModelsCard onBrowseModels={onBrowseModels} />)
    await user.click(screen.getByRole("button", { name: /Browse models/i }))
    expect(onBrowseModels).toHaveBeenCalled()
  })
})
