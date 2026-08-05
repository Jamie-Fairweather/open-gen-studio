/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ARCHES } from "@/lib/creator-arches"

const setUserBlueprintThumbnail = vi.fn(async () => "/new.png")
const clearUserBlueprintThumbnail = vi.fn(async () => {})
const notifySuccess = vi.fn()

vi.mock("@/lib/host", () => ({
  setUserBlueprintThumbnail: (...a: unknown[]) =>
    setUserBlueprintThumbnail(...a),
  clearUserBlueprintThumbnail: (...a: unknown[]) =>
    clearUserBlueprintThumbnail(...a),
  gallerySrc: (p: string) => `asset://${p}`,
}))
vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}))
vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    onValueChange?: (item: { value: string } | null) => void
    children?: React.ReactNode
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.(null)}>
        mock-sel-null
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectPopup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("./creator-thumbnail-field", () => ({
  CreatorThumbnailField: ({
    onPick,
    onClear,
  }: {
    onPick: (p: {
      bytes: number[]
      ext: string
      previewUrl: string
    }) => void | Promise<void>
    onClear: () => void | Promise<void>
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          void onPick({ bytes: [2], ext: "png", previewUrl: "blob:n" })
        }
      >
        pick
      </button>
      <button type="button" onClick={() => void onClear()}>
        clear
      </button>
    </div>
  ),
}))

import { RecipeIdentitySection } from "./recipe-identity-section"
import { RecipeModelsSection } from "./recipe-models-section"
import { RecipeDefaultsSection } from "./recipe-defaults-section"

describe("recipe sections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  })

  it("identity pick/clear for create and edit", async () => {
    const setPendingThumb = vi.fn()
    const setThumbnailPath = vi.fn()
    const setName = vi.fn()
    const setIdTouched = vi.fn()
    const setIdManual = vi.fn()
    const setDescription = vi.fn()

    const { rerender } = render(
      <RecipeIdentitySection
        editing={false}
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={{ bytes: [1], ext: "png", previewUrl: "blob:old" }}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name=""
        setName={setName}
        id="auto"
        setIdTouched={setIdTouched}
        setIdManual={setIdManual}
        archId="z-image"
        applyArch={vi.fn()}
        description=""
        setDescription={setDescription}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    expect(setPendingThumb).toHaveBeenCalled()
    await userEvent.click(screen.getByText("clear"))
    expect(setThumbnailPath).toHaveBeenCalledWith(null)

    fireEvent.change(screen.getByPlaceholderText("My realism pack"), {
      target: { value: "Hello" },
    })
    expect(setName).toHaveBeenCalledWith("Hello")
    fireEvent.change(screen.getByPlaceholderText("my-realism-pack"), {
      target: { value: "id" },
    })
    expect(setIdTouched).toHaveBeenCalledWith(true)
    expect(setIdManual).toHaveBeenCalledWith("id")
    fireEvent.change(screen.getByPlaceholderText("Optional notes"), {
      target: { value: "note" },
    })
    expect(setDescription).toHaveBeenCalledWith("note")

    rerender(
      <RecipeIdentitySection
        editing
        editBlueprintId="bp1"
        busy={false}
        loadingEdit={false}
        thumbnailPath="/t.png"
        pendingThumb={{ bytes: [1], ext: "png", previewUrl: "blob:old" }}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name="N"
        setName={setName}
        id="bp1"
        setIdTouched={setIdTouched}
        setIdManual={setIdManual}
        archId="z-image"
        applyArch={vi.fn()}
        description=""
        setDescription={setDescription}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    await waitFor(() => expect(setUserBlueprintThumbnail).toHaveBeenCalled())
    expect(notifySuccess).toHaveBeenCalledWith("Thumbnail updated")
    await userEvent.click(screen.getByText("clear"))
    await waitFor(() => expect(clearUserBlueprintThumbnail).toHaveBeenCalled())
    expect(notifySuccess).toHaveBeenCalledWith("Thumbnail removed")
  })

  it("models and defaults branches", () => {
    const arch = ARCHES[0]
    const updateModelUrl = vi.fn()
    const resolveModelRow = vi.fn(async () => {})
    render(
      <RecipeModelsSection
        arch={arch}
        models={arch.slots.map((s) => ({
          role: s.role,
          path: s.path,
          filename: "f.safetensors",
          url: "https://x/f.safetensors",
        }))}
        updateModelUrl={updateModelUrl}
        resolveModelRow={resolveModelRow}
      />
    )
    const urlInput = screen.getAllByLabelText(/download URL/i)[0]
    fireEvent.change(urlInput, { target: { value: "https://y/g.safetensors" } })
    fireEvent.blur(urlInput)
    expect(updateModelUrl).toHaveBeenCalled()
    expect(resolveModelRow).toHaveBeenCalled()

    render(
      <RecipeModelsSection
        arch={arch}
        models={[]}
        updateModelUrl={updateModelUrl}
        resolveModelRow={resolveModelRow}
      />
    )

    const setAllowNegative = vi.fn()
    const flux = ARCHES.find((a) => a.id === "flux2")!
    const { rerender } = render(
      <RecipeDefaultsSection
        archId="flux2"
        arch={flux}
        sampler={flux.sampler}
        setSampler={vi.fn()}
        scheduler={flux.scheduler}
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={1}
        setCfg={vi.fn()}
        guidance={3}
        setGuidance={vi.fn()}
        allowNegative={false}
        setAllowNegative={setAllowNegative}
      />
    )
    expect(screen.getByText(/Flux2Scheduler/i)).toBeInTheDocument()

    const ideo = ARCHES.find((a) => a.id === "ideogram4")!
    rerender(
      <RecipeDefaultsSection
        archId="ideogram4"
        arch={ideo}
        sampler={ideo.sampler}
        setSampler={vi.fn()}
        scheduler={ideo.scheduler}
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={1}
        setCfg={vi.fn()}
        guidance={3}
        setGuidance={vi.fn()}
        allowNegative={false}
        setAllowNegative={setAllowNegative}
      />
    )
    expect(screen.getByText(/Ideogram4Scheduler/i)).toBeInTheDocument()

    const negArch = ARCHES.find(
      (a) => a.capabilities.negative && !a.usesGuidance
    )!
    rerender(
      <RecipeDefaultsSection
        archId={negArch.id}
        arch={negArch}
        sampler={negArch.sampler}
        setSampler={vi.fn()}
        scheduler={negArch.scheduler}
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={5}
        setCfg={vi.fn()}
        guidance={3}
        setGuidance={vi.fn()}
        allowNegative
        setAllowNegative={setAllowNegative}
      />
    )
    fireEvent.click(screen.getByRole("checkbox"))
    expect(setAllowNegative).toHaveBeenCalled()

    const guideArch = ARCHES.find(
      (a) => a.usesGuidance && a.id !== "flux2" && a.id !== "ideogram4"
    )!
    rerender(
      <RecipeDefaultsSection
        archId={guideArch.id}
        arch={guideArch}
        sampler={guideArch.sampler}
        setSampler={vi.fn()}
        scheduler={guideArch.scheduler}
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={1}
        setCfg={vi.fn()}
        guidance={3.5}
        setGuidance={vi.fn()}
        allowNegative={false}
        setAllowNegative={setAllowNegative}
      />
    )
    expect(screen.getByText("Guidance")).toBeInTheDocument()
  })

  it("handles select null and optional model slots", async () => {
    const setSampler = vi.fn()
    const arch = ARCHES[0]
    const { unmount: u1 } = render(
      <RecipeDefaultsSection
        archId={arch.id}
        arch={arch}
        sampler={arch.sampler}
        setSampler={setSampler}
        scheduler={arch.scheduler}
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={5}
        setCfg={vi.fn()}
        guidance={3}
        setGuidance={vi.fn()}
        allowNegative={false}
        setAllowNegative={vi.fn()}
      />
    )
    await userEvent.click(screen.getAllByText("mock-sel-null")[0]!)
    expect(setSampler).not.toHaveBeenCalled()
    u1()

    const optionalArch = ARCHES.find((a) => a.slots.some((s) => !s.required))!
    const models = optionalArch.slots.map((s) => ({
      role: s.role,
      path: s.path,
      filename: s.required ? "req.safetensors" : "",
      url: s.required ? "https://x/req.safetensors" : "",
    }))
    const { unmount: u2 } = render(
      <RecipeModelsSection
        arch={optionalArch}
        models={models}
        updateModelUrl={vi.fn()}
        resolveModelRow={vi.fn(async () => {})}
      />
    )
    expect(screen.getAllByLabelText(/download URL/i).length).toBeGreaterThan(0)
    u2()

    const applyArch = vi.fn()
    render(
      <RecipeIdentitySection
        editing={false}
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={null}
        setPendingThumb={vi.fn()}
        setThumbnailPath={vi.fn()}
        name=""
        setName={vi.fn()}
        id=""
        setIdTouched={vi.fn()}
        setIdManual={vi.fn()}
        archId={"not-in-items" as typeof arch.id}
        applyArch={applyArch}
        description=""
        setDescription={vi.fn()}
      />
    )
    await userEvent.click(screen.getAllByText("mock-sel-null")[0]!)
    expect(applyArch).not.toHaveBeenCalled()
  })

  it("renders unknown sampler and scheduler values", () => {
    const arch = ARCHES.find((a) => a.id !== "flux2" && a.id !== "ideogram4")!
    render(
      <RecipeDefaultsSection
        archId={arch.id}
        arch={arch}
        sampler="not-in-list"
        setSampler={vi.fn()}
        scheduler="also-custom"
        setScheduler={vi.fn()}
        steps={10}
        setSteps={vi.fn()}
        cfg={5}
        setCfg={vi.fn()}
        guidance={3}
        setGuidance={vi.fn()}
        allowNegative={false}
        setAllowNegative={vi.fn()}
      />
    )
    expect(screen.getByText("Sampler")).toBeTruthy()
    expect(screen.getByText("Scheduler")).toBeTruthy()
  })
})
