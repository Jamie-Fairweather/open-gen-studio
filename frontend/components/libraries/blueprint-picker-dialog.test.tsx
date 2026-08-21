import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Blueprint } from "@/lib/host"

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    gallerySrc: (p: string) => `asset://${p}`,
  })
})

import { BlueprintPickerDialog } from "./blueprint-picker-dialog"

function bp(partial: Partial<Blueprint>): Blueprint {
  return {
    id: "bp1",
    name: "Flux Pack",
    category: "image",
    description: "desc",
    arch: "flux",
    runtime: "comfy",
    source: "official",
    minimumVramGb: 8,
    modelCount: 2,
    modelsReady: 0,
    totalSizeBytes: 1000,
    localSizeBytes: 100,
    dir: "/d",
    thumbnailPath: null,
    ...partial,
  }
}

describe("BlueprintPickerDialog", () => {
  it("searches, pills, select/install branches", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onInstall = vi.fn()
    const onOpenChange = vi.fn()
    const items = [
      bp({
        id: "mine",
        name: "Mine BP",
        source: "user",
        modelsReady: 2,
        modelCount: 2,
        thumbnailPath: "/t.png",
        requiresHfToken: true,
        requiresCivitaiToken: true,
        totalSizeBytes: null,
        localSizeBytes: 50,
      }),
      bp({
        id: "inst",
        name: "Installed",
        modelsReady: 2,
        modelCount: 2,
        localSizeBytes: 0,
        totalSizeBytes: null,
      }),
      bp({
        id: "part",
        name: "Partial",
        modelsReady: 1,
        modelCount: 2,
        arch: "unknown-arch",
      }),
      bp({
        id: "fresh",
        name: "Fresh",
        modelsReady: 0,
        modelCount: 2,
        description: "",
        minimumVramGb: null,
        requiresCivitaiToken: true,
      }),
    ]

    render(
      <BlueprintPickerDialog
        open
        onOpenChange={onOpenChange}
        blueprints={items}
        selectedId="inst"
        installingId="part"
        queuedIds={["fresh"]}
        sizesProbing
        onSelect={onSelect}
        onInstall={onInstall}
        onUninstall={() => {}}
      />
    )

    expect(screen.getByText("Mine")).toBeTruthy()
    expect(screen.getAllByText("Official").length).toBeGreaterThan(0)
    expect(
      screen.getByRole("heading", { level: 3, name: "Installed" })
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { level: 3, name: "Not installed" })
    ).toBeTruthy()
    expect(screen.getAllByText(/checking size/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Downloading").length).toBeGreaterThan(0)
    expect(screen.getByText("Queued")).toBeTruthy()

    await user.type(screen.getByPlaceholderText("Search…"), "zzzz-no-match")
    expect(screen.getByText(/No blueprints match/)).toBeTruthy()
    await user.clear(screen.getByPlaceholderText("Search…"))
    await user.type(screen.getByPlaceholderText("Search…"), "Mine")
    expect(screen.getByText("Mine BP")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /^Select$/i }))
    expect(onSelect).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selects official installed and closes", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <BlueprintPickerDialog
        open
        onOpenChange={onOpenChange}
        blueprints={[
          bp({
            id: "inst2",
            name: "Installed Two",
            modelsReady: 1,
            modelCount: 1,
          }),
        ]}
        selectedId={null}
        installingId={null}
        sizesProbing={false}
        onSelect={onSelect}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    )
    await user.click(screen.getByRole("button", { name: /^Select$/i }))
    expect(onSelect).toHaveBeenCalledWith("inst2")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("install/resume/uninstall buttons", async () => {
    const user = userEvent.setup()
    const onInstall = vi.fn()
    const onUninstall = vi.fn()
    render(
      <BlueprintPickerDialog
        open
        onOpenChange={() => {}}
        blueprints={[
          bp({
            id: "a",
            name: "A",
            modelsReady: 0,
            modelCount: 1,
            requiresHfToken: true,
          }),
          bp({
            id: "b",
            name: "B",
            modelsReady: 1,
            modelCount: 1,
          }),
          bp({
            id: "c",
            name: "C",
            modelsReady: 1,
            modelCount: 2,
          }),
        ]}
        selectedId={null}
        installingId={null}
        sizesProbing={false}
        onSelect={() => {}}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />
    )
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(onInstall).toHaveBeenCalledWith("a")
    await user.click(screen.getByRole("button", { name: /^Uninstall$/i }))
    expect(screen.getByText(/Uninstall blueprint\?/)).toBeTruthy()
    await user.click(
      screen.getAllByRole("button", { name: /^Uninstall$/i }).at(-1)!
    )
    expect(onUninstall).toHaveBeenCalledWith("b")
    await user.click(screen.getByRole("button", { name: /^Resume$/i }))
    expect(onInstall).toHaveBeenCalledWith("c")
  })
})
