import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { LoraPack } from "@/lib/host"

vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    onValueChange,
  }: {
    onValueChange?: (v: number[] | number) => void
  }) => (
    <button
      type="button"
      aria-label="strength"
      onClick={() => {
        onValueChange?.([1.25])
        onValueChange?.(1.5)
        onValueChange?.("bad" as unknown as number)
        onValueChange?.(Number.NaN as unknown as number)
      }}
    >
      slider
    </button>
  ),
}))

import { LoraStack } from "./lora-stack"

function pack(partial: Partial<LoraPack> = {}): LoraPack {
  return {
    id: "p1",
    name: "Style",
    description: "d",
    source: "official",
    triggerWords: [],
    defaultStrength: 1,
    strengthMin: 0,
    strengthMax: 2,
    arches: ["flux"],
    variants: [
      {
        arch: "flux",
        filename: "a.safetensors",
        path: "/a",
        url: "u",
        ready: true,
      },
    ],
    variantsReady: 1,
    variantCount: 1,
    thumbnailPath: null,
    ...partial,
  }
}

describe("LoraStack", () => {
  it("empty compatible / empty stack / stack with install and slider", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onInstall = vi.fn()
    const onOpen = vi.fn()

    const { rerender } = render(
      <LoraStack
        arch="sdxl"
        packs={[pack()]}
        stack={[]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
      />
    )
    expect(screen.getByText(/No LoRA packs for this architecture/)).toBeTruthy()

    rerender(
      <LoraStack
        arch="flux"
        packs={[pack()]}
        stack={[]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
      />
    )
    expect(screen.getByText(/Stack optional packs/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /Add LoRA/i }))
    expect(onOpen).toHaveBeenCalled()

    const notReady = pack({
      variants: [
        {
          arch: "flux",
          filename: "a.safetensors",
          path: "",
          url: "u",
          ready: false,
        },
      ],
      variantsReady: 0,
    })
    rerender(
      <LoraStack
        arch="flux"
        packs={[notReady, pack({ id: "p2", name: "Ready", strengthMax: 10 })]}
        stack={[
          { id: "p1", strength: 0.5 },
          { id: "p2", strength: 1 },
          { id: "missing", strength: 1 },
        ]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
        installingKey="p1:flux"
        queuedKeys={["other:flux"]}
      />
    )
    expect(screen.getAllByText(/Downloading/).length).toBeGreaterThan(0)
    expect(screen.getByText("missing")).toBeTruthy()

    rerender(
      <LoraStack
        arch="flux"
        packs={[notReady]}
        stack={[{ id: "p1", strength: 1 }]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
        queuedKeys={["p1:flux"]}
      />
    )
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0)

    rerender(
      <LoraStack
        arch="flux"
        packs={[notReady]}
        stack={[{ id: "p1", strength: 1 }]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
      />
    )
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(onInstall).toHaveBeenCalledWith("p1", "flux")

    // invalid arch short-circuits install
    onInstall.mockClear()
    rerender(
      <LoraStack
        arch="not-an-arch"
        packs={[
          pack({
            arches: ["not-an-arch"],
            variants: [
              {
                arch: "not-an-arch",
                filename: "x",
                path: "",
                url: "",
                ready: false,
              },
            ],
          }),
        ]}
        stack={[{ id: "p1", strength: 1 }]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
      />
    )
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(onInstall).not.toHaveBeenCalled()

    rerender(
      <LoraStack
        arch="flux"
        packs={[
          pack({ strengthMin: 0, strengthMax: 1 }),
          pack({ id: "p2", name: "B" }),
        ]}
        stack={[
          { id: "p1", strength: 0.75 },
          { id: "p2", strength: 0.5 },
        ]}
        onChange={onChange}
        onInstallVariant={onInstall}
        onOpenLibrary={onOpen}
      />
    )
    expect(screen.getByText("0.75")).toBeTruthy()
    await user.click(screen.getAllByLabelText("strength")[0]!)
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "p1", strength: 1.25 }),
      expect.objectContaining({ id: "p2", strength: 0.5 }),
    ])
    await user.click(screen.getByLabelText("Remove Style"))
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "p2", strength: 0.5 }),
    ])
  })
})
