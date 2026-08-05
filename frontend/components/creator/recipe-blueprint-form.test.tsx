/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const handleSave = vi.fn(async () => {})
const formState = {
  busy: false,
  loadingEdit: false,
  editing: true,
  footerStatus: "ready",
}

vi.mock("./use-recipe-blueprint-form", () => ({
  useRecipeBlueprintForm: () => ({
    ...formState,
    thumbnailPath: null,
    pendingThumb: null,
    setPendingThumb: vi.fn(),
    setThumbnailPath: vi.fn(),
    name: "N",
    setName: vi.fn(),
    id: "n",
    setIdTouched: vi.fn(),
    setIdManual: vi.fn(),
    archId: "z-image",
    applyArch: vi.fn(),
    description: "",
    setDescription: vi.fn(),
    arch: {
      slots: [],
      label: "Z",
      usesGuidance: false,
      capabilities: { negative: false },
    },
    models: [],
    updateModelUrl: vi.fn(),
    resolveModelRow: vi.fn(),
    sampler: "euler",
    setSampler: vi.fn(),
    scheduler: "normal",
    setScheduler: vi.fn(),
    steps: 8,
    setSteps: vi.fn(),
    cfg: 1,
    setCfg: vi.fn(),
    guidance: 3,
    setGuidance: vi.fn(),
    allowNegative: false,
    setAllowNegative: vi.fn(),
    handleSave,
  }),
}))
vi.mock("./recipe-identity-section", () => ({
  RecipeIdentitySection: () => <div>identity</div>,
}))
vi.mock("./recipe-models-section", () => ({
  RecipeModelsSection: () => <div>models</div>,
}))
vi.mock("./recipe-defaults-section", () => ({
  RecipeDefaultsSection: () => <div>defaults</div>,
}))

import { RecipeBlueprintForm } from "./recipe-blueprint-form"

describe("RecipeBlueprintForm", () => {
  it("covers editing, loading, and create footer labels", async () => {
    Object.assign(formState, { busy: false, loadingEdit: false, editing: true })
    const onDelete = vi.fn()
    const { rerender } = render(
      <RecipeBlueprintForm
        onSaved={vi.fn()}
        editBlueprintId="bp1"
        onDelete={onDelete}
      />
    )
    expect(screen.getByText(/Editing/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onDelete).toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }))
    expect(handleSave).toHaveBeenCalled()

    Object.assign(formState, { busy: true, loadingEdit: true, editing: false })
    rerender(<RecipeBlueprintForm onSaved={vi.fn()} />)
    expect(screen.getByText("Loading blueprint…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()

    Object.assign(formState, {
      busy: false,
      loadingEdit: false,
      editing: false,
    })
    rerender(<RecipeBlueprintForm onSaved={vi.fn()} />)
    expect(
      screen.getByRole("button", { name: "Save recipe" })
    ).toBeInTheDocument()
  })
})
