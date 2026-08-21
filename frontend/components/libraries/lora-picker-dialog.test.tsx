import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LoraPack } from "@/lib/host"

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({ gallerySrc: (p: string) => `asset://${p}` })
})

import { LoraPickerDialog } from "./lora-picker-dialog"

function pack(partial: Partial<LoraPack>): LoraPack {
  return {
    id: "l1",
    name: "Pack",
    description: "desc",
    source: "official",
    triggerWords: ["trig"],
    defaultStrength: 1,
    strengthMin: 0,
    strengthMax: 2,
    arches: ["flux"],
    variants: [
      {
        arch: "flux",
        filename: "f.safetensors",
        path: "/f",
        url: "u",
        ready: false,
      },
    ],
    variantsReady: 0,
    variantCount: 1,
    thumbnailPath: null,
    ...partial,
  }
}

describe("LoraPickerDialog", () => {
  it("filters by arch/search and install/select flows", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onInstall = vi.fn()
    const onOpenChange = vi.fn()
    const packs = [
      pack({
        id: "mine",
        name: "Mine Lora",
        source: "user",
        thumbnailPath: "/t.png",
        variants: [
          {
            arch: "flux",
            filename: "m.safetensors",
            path: "/m",
            url: "u",
            ready: true,
          },
        ],
        variantsReady: 1,
      }),
      pack({ id: "avail", name: "Avail", description: "" }),
      pack({
        id: "many",
        name: "Many",
        arches: ["a", "b", "c", "d"],
        variants: [
          {
            arch: "flux",
            filename: "x",
            path: "",
            url: "",
            ready: false,
          },
        ],
      }),
      pack({
        id: "sd",
        name: "SD Only",
        arches: ["sdxl"],
        variants: [
          {
            arch: "sdxl",
            filename: "s",
            path: "",
            url: "",
            ready: false,
          },
        ],
      }),
    ]

    render(
      <LoraPickerDialog
        open
        onOpenChange={onOpenChange}
        packs={packs}
        arch="flux"
        selectedIds={["mine"]}
        installingKey="avail:flux"
        queuedKeys={["many:flux"]}
        onSelect={onSelect}
        onInstall={onInstall}
        onUninstall={() => {}}
      />
    )
    expect(screen.getByText(/Packs for flux/)).toBeTruthy()
    expect(
      screen.getByRole("heading", { level: 3, name: "Installed" })
    ).toBeTruthy()
    expect(
      screen.getByRole("heading", { level: 3, name: "Not installed" })
    ).toBeTruthy()
    expect(screen.getByText("In stack")).toBeTruthy()
    expect(screen.getByText("Downloading")).toBeTruthy()
    expect(screen.getByText("Queued")).toBeTruthy()

    await user.type(screen.getByPlaceholderText("Search…"), "nope-xxx")
    expect(screen.getByText(/No LoRA packs for flux/)).toBeTruthy()
    await user.clear(screen.getByPlaceholderText("Search…"))
    await user.type(screen.getByPlaceholderText("Search…"), "Avail")
    await user.click(screen.getByRole("button", { name: /^Add$/i }))
    expect(onSelect).toHaveBeenCalledWith("avail")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("selects mine and official ready closing dialog", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onOpenChange = vi.fn()
    const packs = [
      pack({
        id: "mine2",
        name: "My Ready",
        source: "user",
        variants: [
          {
            arch: "flux",
            filename: "m",
            path: "/m",
            url: "u",
            ready: true,
          },
        ],
        variantsReady: 1,
      }),
      pack({
        id: "ready2",
        name: "Off Ready",
        variants: [
          {
            arch: "flux",
            filename: "r",
            path: "/r",
            url: "u",
            ready: true,
          },
        ],
        variantsReady: 1,
      }),
    ]
    const { rerender } = render(
      <LoraPickerDialog
        open
        onOpenChange={onOpenChange}
        packs={packs}
        arch="flux"
        onSelect={onSelect}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    )
    // Installed Official "Add" (second Add when Mine + Official are both ready)
    await user.click(screen.getAllByRole("button", { name: /^Add$/i })[1]!)
    expect(onSelect).toHaveBeenCalledWith("ready2")
    expect(onOpenChange).toHaveBeenCalledWith(false)

    onSelect.mockClear()
    onOpenChange.mockClear()
    rerender(
      <LoraPickerDialog
        open
        onOpenChange={onOpenChange}
        packs={[packs[0]!]}
        arch="flux"
        onSelect={onSelect}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    )
    await user.click(screen.getByRole("button", { name: /^Add$/i }))
    expect(onSelect).toHaveBeenCalledWith("mine2")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("no arch mode and install/uninstall flows", async () => {
    const user = userEvent.setup()
    const onInstall = vi.fn()
    const onUninstall = vi.fn()
    render(
      <LoraPickerDialog
        open
        onOpenChange={() => {}}
        packs={[
          pack({
            id: "r",
            name: "ReadyPack",
            variants: [
              {
                arch: "flux",
                filename: "f",
                path: "/f",
                url: "u",
                ready: true,
              },
            ],
            variantsReady: 1,
          }),
          pack({ id: "i", name: "InstallMe", description: "" }),
        ]}
        onSelect={() => {}}
        onInstall={onInstall}
        onUninstall={onUninstall}
      />
    )
    expect(screen.getByText(/Catalog LoRAs/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(onInstall).toHaveBeenCalledWith("i", "flux")
    await user.click(screen.getByRole("button", { name: /^Uninstall$/i }))
    expect(screen.getByText(/Uninstall LoRA\?/)).toBeTruthy()
    await user.click(
      screen.getAllByRole("button", { name: /^Uninstall$/i }).at(-1)!
    )
    expect(onUninstall).toHaveBeenCalledWith("r", "flux")

    await user.type(screen.getByPlaceholderText("Search…"), "zzz")
    expect(screen.getByText(/No LoRA packs match/)).toBeTruthy()
  })

  it("covers variant fallbacks and arch label branches", () => {
    render(
      <LoraPickerDialog
        open
        onOpenChange={() => {}}
        packs={[
          pack({
            id: "wide",
            name: "Wide",
            description: "",
            triggerWords: ["style"],
            arches: ["a", "b", "c", "d", "e"],
            variants: [
              {
                arch: "flux",
                filename: "f.safetensors",
                path: "",
                url: "",
                ready: false,
              },
            ],
          }),
        ]}
        onSelect={() => {}}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    )
    expect(screen.getByText("5 arches")).toBeTruthy()
    expect(screen.getByText(/Trigger: style/)).toBeTruthy()
  })

  it("uses first variant when arch is unset and pack has no ready variant", () => {
    render(
      <LoraPickerDialog
        open
        onOpenChange={() => {}}
        packs={[
          pack({
            id: "bare",
            name: "Bare",
            description: "LoRA pack",
            triggerWords: [],
            variants: [],
            variantCount: 0,
            variantsReady: 0,
          }),
        ]}
        onSelect={() => {}}
        onInstall={() => {}}
        onUninstall={() => {}}
      />
    )
    expect(screen.getByText("Bare")).toBeTruthy()
  })
})
