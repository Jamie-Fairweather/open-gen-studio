/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { host, notify } = vi.hoisted(() => {
  const host = {
    listBlueprints: vi.fn(),
    listLoras: vi.fn(),
    gallerySrc: vi.fn((p: string) => `asset://${p}`),
    openUserBlueprintsDir: vi.fn(async () => "/bp"),
    openUserLorasDir: vi.fn(async () => "/lora"),
    deleteUserBlueprint: vi.fn(async () => {}),
    deleteUserLora: vi.fn(async () => {}),
  }
  const notify = {
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  }
  return { host, notify }
})

vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react")
  const TabsCtx = React.createContext<{
    onValueChange?: (v: string | number | null) => void
  }>({})
  return {
    Tabs: ({
      value,
      onValueChange,
      children,
    }: {
      value?: string
      onValueChange?: (v: string | number | null) => void
      children: React.ReactNode
    }) => (
      <TabsCtx.Provider value={{ onValueChange }}>
        <button
          type="button"
          aria-label="invalid-mode"
          className="sr-only"
          onClick={() => onValueChange?.(null)}
        />
        <div data-testid="tabs" data-value={value}>
          {children}
        </div>
      </TabsCtx.Provider>
    ),
    TabsList: ({ children }: { children: React.ReactNode }) => (
      <div role="tablist">{children}</div>
    ),
    TabsTab: ({
      value,
      children,
    }: {
      value: string
      children: React.ReactNode
    }) => {
      const ctx = React.useContext(TabsCtx)
      return (
        <button
          type="button"
          role="tab"
          onClick={() => ctx.onValueChange?.(value)}
        >
          {children}
        </button>
      )
    },
  }
})
vi.mock("@/lib/host", () => host)
vi.mock("@/lib/notify", () => notify)
vi.mock("@/components/studio/store", () => ({
  useStudioStore: Object.assign(() => ({}), {
    getState: () => ({
      setLoraStack: (fn: (p: { id: string }[]) => { id: string }[]) =>
        fn([{ id: "lora1" }, { id: "other" }]),
    }),
  }),
}))
vi.mock("./recipe-blueprint-form", () => ({
  RecipeBlueprintForm: ({
    onSaved,
    onDelete,
    onEditCleared,
  }: {
    onSaved: (id: string) => void
    onDelete?: () => void
    onEditCleared?: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onSaved("bp1")}>
        save-bp
      </button>
      <button type="button" onClick={() => onDelete?.()}>
        del-bp
      </button>
      <button type="button" onClick={() => onEditCleared?.()}>
        clear-bp
      </button>
    </div>
  ),
}))
vi.mock("./creator-lora-form", () => ({
  CreatorLoraForm: ({
    onSaved,
    onDelete,
  }: {
    onSaved: (p: { id: string }) => void
    onDelete?: () => void
  }) => (
    <div>
      <button type="button" onClick={() => onSaved({ id: "lora1" })}>
        save-lora
      </button>
      <button type="button" onClick={() => onDelete?.()}>
        del-lora
      </button>
    </div>
  ),
}))

import { CreatorPanel } from "./creator-panel"

describe("CreatorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    host.listBlueprints.mockResolvedValue([
      {
        id: "bp1",
        name: "Alpha",
        source: "user",
        description: "desc",
        arch: "z-image",
        thumbnailPath: "/t.png",
      },
      {
        id: "bp2",
        name: "Beta",
        source: "user",
        description: "",
        arch: "",
        thumbnailPath: null,
      },
    ])
    host.listLoras.mockResolvedValue([
      {
        id: "lora1",
        name: "L1",
        source: "user",
        arches: ["a", "b", "c", "d"],
        variantCount: 4,
        variantsReady: 2,
        thumbnailPath: "/lt.png",
      },
      {
        id: "lora2",
        name: "L2",
        source: "user",
        arches: ["z-image"],
        variantCount: 1,
        variantsReady: 1,
        thumbnailPath: null,
      },
    ])
  })

  it("lists, creates, edits, deletes, reveals, modes", async () => {
    const onBlueprintsChanged = vi.fn()
    const onEditCleared = vi.fn()
    const { rerender } = render(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        onEditCleared={onEditCleared}
      />
    )
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument())

    await userEvent.click(
      screen.getByRole("button", { name: /Reveal folder/i })
    )
    await waitFor(() => expect(notify.notifySuccess).toHaveBeenCalled())

    host.openUserBlueprintsDir.mockRejectedValueOnce(new Error("reveal"))
    await userEvent.click(
      screen.getByRole("button", { name: /Reveal folder/i })
    )
    await waitFor(() => expect(notify.notifyError).toHaveBeenCalled())

    host.openUserBlueprintsDir.mockRejectedValueOnce("reveal str")
    await userEvent.click(
      screen.getByRole("button", { name: /Reveal folder/i })
    )
    await waitFor(() =>
      expect(notify.notifyError).toHaveBeenCalledWith("reveal str")
    )

    await userEvent.click(screen.getByText("Create new"))
    expect(screen.getByText("save-bp")).toBeInTheDocument()
    await userEvent.click(screen.getByText("save-bp"))
    expect(onBlueprintsChanged).toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /Back/i }))

    await userEvent.click(screen.getByText("Alpha"))
    await userEvent.click(screen.getByText("del-bp"))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(host.deleteUserBlueprint).toHaveBeenCalled())

    await userEvent.click(screen.getByRole("tab", { name: "LoRA" }))
    await waitFor(() => expect(screen.getByText("L1")).toBeInTheDocument())
    await userEvent.click(
      screen.getByRole("button", { name: /Reveal folder/i })
    )
    await waitFor(() => expect(host.openUserLorasDir).toHaveBeenCalled())
    await userEvent.click(screen.getByText("Create new"))
    await userEvent.click(screen.getByText("save-lora"))
    await waitFor(() =>
      expect(screen.getByText("save-lora")).toBeInTheDocument()
    )
    await userEvent.click(screen.getByRole("button", { name: /Back/i }))
    await userEvent.click(screen.getByText("L1"))
    await userEvent.click(screen.getByText("del-lora"))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(host.deleteUserLora).toHaveBeenCalled())

    host.deleteUserLora.mockRejectedValueOnce(new Error("del fail"))
    await userEvent.click(screen.getByText("L2"))
    await userEvent.click(screen.getByText("del-lora"))
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() =>
      expect(notify.notifyError).toHaveBeenCalledWith("del fail", "Delete")
    )

    host.listBlueprints.mockRejectedValueOnce(new Error("bp fail"))
    host.listLoras.mockRejectedValueOnce(new Error("lora fail"))
    rerender(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        editBlueprintId="bp1"
        onEditCleared={onEditCleared}
      />
    )
    await waitFor(() => expect(screen.getByText("save-bp")).toBeInTheDocument())
    rerender(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        editBlueprintId="bp2"
        onEditCleared={onEditCleared}
      />
    )

    host.listBlueprints.mockResolvedValue([])
    host.listLoras.mockResolvedValue([])
    rerender(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        editBlueprintId={null}
        onEditCleared={onEditCleared}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /Back/i }))
    await waitFor(() =>
      expect(screen.getByText(/None yet/i)).toBeInTheDocument()
    )
  })

  it("covers mode guard, cards, delete cancel, and deep link", async () => {
    host.listBlueprints.mockResolvedValue([
      {
        id: "bp-no-arch",
        name: "NoArch",
        source: "user",
        description: "d",
        arch: "unknown-arch",
        thumbnailPath: null,
      },
    ])
    host.listLoras.mockResolvedValue([
      {
        id: "lora-empty",
        name: "Empty",
        source: "user",
        arches: [],
        variantCount: 0,
        variantsReady: 0,
        thumbnailPath: null,
      },
      {
        id: "lora-many",
        name: "Many",
        source: "user",
        arches: ["a", "b", "c", "d", "e"],
        variantCount: 5,
        variantsReady: 3,
        thumbnailPath: null,
      },
    ])
    const onBlueprintsChanged = vi.fn()
    const onEditCleared = vi.fn()
    const { rerender } = render(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        editBlueprintId="bp-no-arch"
        onEditCleared={onEditCleared}
      />
    )
    await waitFor(() => expect(screen.getByText("save-bp")).toBeInTheDocument())
    await userEvent.click(screen.getByRole("button", { name: /Back/i }))

    rerender(
      <CreatorPanel
        onBlueprintsChanged={onBlueprintsChanged}
        onEditCleared={onEditCleared}
      />
    )
    await waitFor(() => expect(screen.getByText("NoArch")).toBeInTheDocument())

    await userEvent.click(screen.getByRole("tab", { name: "LoRA" }))
    await waitFor(() => expect(screen.getByText("Empty")).toBeInTheDocument())
    await waitFor(() =>
      expect(screen.getByText("5 arches")).toBeInTheDocument()
    )

    await userEvent.click(screen.getByRole("tab", { name: "Blueprint" }))
    await waitFor(() => expect(screen.getByText("NoArch")).toBeInTheDocument())

    await userEvent.click(screen.getByText("NoArch"))
    await userEvent.click(screen.getAllByText("del-bp")[0]!)
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(host.deleteUserBlueprint).not.toHaveBeenCalled()

    host.deleteUserBlueprint.mockRejectedValueOnce(new Error("bp del"))
    await userEvent.click(screen.getAllByText("del-bp")[0]!)
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() =>
      expect(notify.notifyError).toHaveBeenCalledWith("bp del", "Delete")
    )

    host.deleteUserBlueprint.mockResolvedValueOnce(undefined)
    await userEvent.click(screen.getAllByText("del-bp")[0]!)
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(onBlueprintsChanged).toHaveBeenCalled())

    await userEvent.click(screen.getByRole("tab", { name: "LoRA" }))
    await userEvent.click(screen.getByText("Create new"))
    expect(screen.getByText("save-lora")).toBeInTheDocument()
  })

  it("ignores invalid tab values", async () => {
    render(
      <CreatorPanel onBlueprintsChanged={vi.fn()} onEditCleared={vi.fn()} />
    )
    await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument())
    await userEvent.click(screen.getByRole("button", { name: "invalid-mode" }))
    expect(screen.getByText("Alpha")).toBeInTheDocument()
  })
})
