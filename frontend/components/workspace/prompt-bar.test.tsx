/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const selectorMocks = vi.hoisted(() => ({
  selected: { name: "BP" } as { name: string } | null,
}))

vi.mock("@/components/studio/store", async () => {
  const { createTestStudioStore } = await import("@/test/create-test-store")
  const store = createTestStudioStore()
  store.setState({
    desktop: true,
    prompt: "",
    controlValues: {},
    generating: false,
    genStep: null,
    aspectId: "1:1",
    sideLength: 1024,
    queuePulseToken: 0,
    applySize: vi.fn(),
    handleGenerate: vi.fn(async () => {}),
    setPickerOpen: vi.fn(),
    openImageToPrompt: vi.fn(),
    openPromptEnhancer: vi.fn(),
    setPrompt: (v: string) => store.setState({ prompt: v }),
    setControlValues: (fn: unknown) => {
      const prev = store.getState().controlValues
      const next =
        typeof fn === "function"
          ? (fn as (p: Record<string, unknown>) => Record<string, unknown>)(
              prev
            )
          : fn
      store.setState({ controlValues: next as Record<string, unknown> })
    },
  })
  return {
    useStudioStore: Object.assign(
      (sel: (s: unknown) => unknown) => sel(store.getState()),
      {
        getState: () => store.getState(),
        setState: store.setState,
        subscribe: store.subscribe,
      }
    ),
    useStudioSelector: (sel: (s: unknown) => unknown) => sel(store.getState()),
  }
})
vi.mock("@/components/studio/selectors", () => ({
  selectCanGenerate: () => true,
  selectHasNegativePrompt: () => true,
  selectHasSizeControls: () => true,
  selectSelected: () => selectorMocks.selected,
  selectSizeLabel: () => "1024×1024",
  selectStudioLabel: () => "Image",
}))
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({
    children,
    ...rest
  }: {
    children?: React.ReactNode
  } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
  PopoverPopup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock("@/components/ui/slider", () => ({
  Slider: ({ onValueChange }: { onValueChange?: (v: number[]) => void }) => (
    <button type="button" onClick={() => onValueChange?.([768])}>
      mock-side-slider
    </button>
  ),
}))

import { PromptBar, StudioPromptBar } from "./prompt-bar"

describe("PromptBar", () => {
  beforeEach(() => {
    selectorMocks.selected = { name: "BP" }
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it("covers generate, size, tools, pulse", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onGenerate = vi.fn(async () => {})
    const onApplySize = vi.fn()
    const onOpenImageToPrompt = vi.fn()
    const onOpenPromptEnhancer = vi.fn()
    const { rerender } = render(
      <PromptBar
        prompt=""
        onPromptChange={vi.fn()}
        showNegative
        negativePrompt=""
        onNegativeChange={vi.fn()}
        canGenerate
        studioLabel="Image"
        generating
        genStep={{ jobId: "j", step: 2, max: 10 }}
        blueprintName={null}
        onOpenBlueprintPicker={vi.fn()}
        hasSizeControls
        aspectId="1:1"
        sideLength={1024}
        sizeLabel="1024×1024"
        onApplySize={onApplySize}
        onGenerate={onGenerate}
        queuePulseToken={1}
        onOpenImageToPrompt={onOpenImageToPrompt}
        onOpenPromptEnhancer={onOpenPromptEnhancer}
      />
    )
    expect(screen.getByText("On the lane")).toBeInTheDocument()
    await user.click(screen.getByLabelText("Image to Prompt"))
    expect(onOpenImageToPrompt).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Add to queue/i }))
    expect(onGenerate).toHaveBeenCalled()

    rerender(
      <PromptBar
        prompt="hello"
        onPromptChange={vi.fn()}
        showNegative={false}
        negativePrompt=""
        onNegativeChange={vi.fn()}
        canGenerate={false}
        studioLabel="Video"
        generating={false}
        genStep={null}
        blueprintName="BP"
        onOpenBlueprintPicker={vi.fn()}
        hasSizeControls={false}
        aspectId="1:1"
        sideLength={1024}
        sizeLabel="1024×1024"
        onApplySize={onApplySize}
        onGenerate={onGenerate}
        queuePulseToken={0}
        onOpenImageToPrompt={onOpenImageToPrompt}
        onOpenPromptEnhancer={onOpenPromptEnhancer}
      />
    )
    expect(
      screen.getByPlaceholderText(/not available yet/i)
    ).toBeInTheDocument()
    await user.click(screen.getByLabelText("Enhance prompt"))
    expect(onOpenPromptEnhancer).toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    vi.useRealTimers()

    const onPromptChange = vi.fn()
    const onNegativeChange = vi.fn()
    const onApply = vi.fn()
    render(
      <PromptBar
        prompt="p"
        onPromptChange={onPromptChange}
        showNegative
        negativePrompt="n"
        onNegativeChange={onNegativeChange}
        canGenerate
        studioLabel="Image"
        generating={false}
        genStep={null}
        blueprintName="BP"
        onOpenBlueprintPicker={vi.fn()}
        hasSizeControls
        aspectId="1:1"
        sideLength={1024}
        sizeLabel="1024×1024"
        onApplySize={onApply}
        onGenerate={vi.fn()}
        queuePulseToken={0}
      />
    )
    fireEvent.change(screen.getByDisplayValue("p"), {
      target: { value: "p2" },
    })
    expect(onPromptChange).toHaveBeenCalledWith("p2")
    fireEvent.change(screen.getByDisplayValue("n"), {
      target: { value: "n2" },
    })
    expect(onNegativeChange).toHaveBeenCalledWith("n2")
    const aspect = screen
      .getAllByRole("button")
      .find((b) => /16:9/.test(b.textContent ?? ""))
    if (aspect) await userEvent.click(aspect)
    expect(onApply).toHaveBeenCalled()
    await userEvent.click(screen.getByText("mock-side-slider"))
    expect(onApply).toHaveBeenCalledWith("1:1", 768)
  })

  it("covers pulse cleanup, unknown aspect, and generating without genStep", async () => {
    const { unmount } = render(
      <PromptBar
        prompt="p"
        onPromptChange={vi.fn()}
        showNegative={false}
        negativePrompt=""
        onNegativeChange={vi.fn()}
        canGenerate
        studioLabel="Image"
        generating={false}
        genStep={null}
        blueprintName={null}
        onOpenBlueprintPicker={vi.fn()}
        hasSizeControls={false}
        aspectId="not-a-ratio"
        sideLength={1024}
        sizeLabel="1024×1024"
        onApplySize={vi.fn()}
        onGenerate={vi.fn()}
        queuePulseToken={3}
      />
    )
    expect(screen.getByText("On the lane")).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(450)
    })
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    render(
      <PromptBar
        prompt="p"
        onPromptChange={vi.fn()}
        showNegative={false}
        negativePrompt=""
        onNegativeChange={vi.fn()}
        canGenerate
        studioLabel="Image"
        generating
        genStep={null}
        blueprintName="BP"
        onOpenBlueprintPicker={vi.fn()}
        hasSizeControls={false}
        aspectId="1:1"
        sideLength={1024}
        sizeLabel="1024×1024"
        onApplySize={vi.fn()}
        onGenerate={vi.fn()}
        queuePulseToken={0}
      />
    )
    const bar = screen.getByRole("progressbar", {
      name: /Generation progress/i,
    })
    expect(bar).toHaveAttribute("aria-valuenow", "0")
    expect(bar.querySelector("[style]")).toHaveStyle({ width: "0%" })
  })

  it("StudioPromptBar wires store and size/negative", async () => {
    const user = userEvent.setup()
    const { useStudioStore } = await import("@/components/studio/store")
    const r1 = render(<StudioPromptBar />)
    expect(
      screen.getByPlaceholderText(/Describe the image/i)
    ).toBeInTheDocument()
    const neg = screen.getByPlaceholderText(/Negative prompt/i)
    fireEvent.change(neg, { target: { value: "blur" } })
    const aspect = screen
      .getAllByRole("button")
      .find((b) => /16:9/.test(b.textContent ?? ""))
    if (aspect) await user.click(aspect)
    await user.click(screen.getByText("mock-side-slider"))
    await user.click(screen.getByLabelText("Image to Prompt"))
    await user.click(screen.getByText("BP"))
    await user.click(screen.getByText("Generate"))
    expect(useStudioStore.getState().openImageToPrompt).toHaveBeenCalled()
    expect(useStudioStore.getState().setPickerOpen).toHaveBeenCalledWith(true)
    expect(useStudioStore.getState().handleGenerate).toHaveBeenCalled()
    r1.unmount()

    useStudioStore.setState({ prompt: "hello" })
    render(<StudioPromptBar />)
    await user.click(screen.getByLabelText("Enhance prompt"))
    expect(useStudioStore.getState().openPromptEnhancer).toHaveBeenCalled()
  })

  it("StudioPromptBar handles missing blueprint name", () => {
    selectorMocks.selected = null
    render(<StudioPromptBar />)
    expect(screen.getByText("Choose blueprint")).toBeInTheDocument()
  })
})
