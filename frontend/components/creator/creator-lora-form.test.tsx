/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const handleSave = vi.fn(async () => {})
const formState = {
  busy: false,
  loadingEdit: false,
  expanding: false,
  editing: true,
}

vi.mock("./use-creator-lora-form", () => ({
  useCreatorLoraForm: () => ({
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
    variants: [],
    setVariants: vi.fn(),
    usedArches: new Set(),
    updateVariant: vi.fn(),
    tryExpandFromUrl: vi.fn(),
    handleSave,
  }),
}))
vi.mock("./creator-lora-identity-section", () => ({
  CreatorLoraIdentitySection: () => <div>id</div>,
}))
vi.mock("./creator-lora-variants-section", () => ({
  CreatorLoraVariantsSection: () => <div>vars</div>,
}))

import { CreatorLoraForm } from "./creator-lora-form"

describe("CreatorLoraForm", () => {
  it("covers footer states", async () => {
    Object.assign(formState, {
      busy: false,
      loadingEdit: false,
      expanding: false,
      editing: true,
    })
    const onDelete = vi.fn()
    const { rerender } = render(
      <CreatorLoraForm editLoraId="l1" onSaved={vi.fn()} onDelete={onDelete} />
    )
    expect(screen.getByText(/Editing · My LoRAs\/l1/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Delete" }))
    expect(onDelete).toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /Save changes/i }))
    expect(handleSave).toHaveBeenCalled()

    Object.assign(formState, {
      busy: false,
      loadingEdit: true,
      expanding: false,
      editing: false,
    })
    rerender(<CreatorLoraForm onSaved={vi.fn()} />)
    expect(screen.getByText("Loading LoRA…")).toBeInTheDocument()

    Object.assign(formState, {
      busy: false,
      loadingEdit: false,
      expanding: true,
      editing: false,
    })
    rerender(<CreatorLoraForm onSaved={vi.fn()} />)
    expect(screen.getByText("Reading CivitAI model…")).toBeInTheDocument()

    Object.assign(formState, {
      busy: true,
      loadingEdit: false,
      expanding: false,
      editing: false,
    })
    rerender(<CreatorLoraForm onSaved={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled()

    Object.assign(formState, {
      busy: false,
      loadingEdit: false,
      expanding: false,
      editing: false,
    })
    rerender(<CreatorLoraForm onSaved={vi.fn()} />)
    expect(screen.getByText(/New · My LoRAs\/n/)).toBeInTheDocument()
  })
})
