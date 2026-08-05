/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ARCHES } from "@/lib/creator-arches"

vi.mock("@/components/ui/select", () => ({
  Select: ({
    onValueChange,
    children,
  }: {
    onValueChange?: (item: { value: string } | null) => void
    children?: React.ReactNode
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.({ value: "4" })}>
        mock-sel-4
      </button>
      <button type="button" onClick={() => onValueChange?.({ value: "2" })}>
        mock-sel-2
      </button>
      <button type="button" onClick={() => onValueChange?.({ value: "euler" })}>
        mock-sel-item
      </button>
      <button type="button" onClick={() => onValueChange?.({ value: "need" })}>
        mock-sel-need
      </button>
      <button
        type="button"
        onClick={() =>
          onValueChange?.({
            value: ARCHES.find((a) => a.id !== "z-image")!.id,
          })
        }
      >
        mock-sel-arch
      </button>
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
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    onValueChange,
    "aria-label": label = "slider",
  }: {
    onValueChange?: (v: number[] | number | string) => void
    "aria-label"?: string
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.([12])}>
        mock-slide-{label}
      </button>
      <button type="button" onClick={() => onValueChange?.(9)}>
        mock-slide-num-{label}
      </button>
      <button type="button" onClick={() => onValueChange?.("x")}>
        mock-slide-bad-{label}
      </button>
    </div>
  ),
}))
vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    onCheckedChange,
    "aria-label": label,
  }: {
    onCheckedChange?: (v: boolean) => void
    "aria-label"?: string
  }) => (
    <div>
      <button type="button" onClick={() => onCheckedChange?.(true)}>
        mock-switch-on-{label}
      </button>
      <button type="button" onClick={() => onCheckedChange?.(false)}>
        mock-switch-off-{label}
      </button>
    </div>
  ),
}))
vi.mock("@/components/ui/number-field", () => ({
  NumberField: ({
    onValueChange,
    children,
  }: {
    onValueChange?: (v: number | null) => void
    children?: React.ReactNode
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.(7)}>
        mock-num
      </button>
      <button type="button" onClick={() => onValueChange?.(null)}>
        mock-num-null
      </button>
      {children}
    </div>
  ),
  NumberFieldGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  NumberFieldInput: () => <input data-testid="num-input" />,
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

const host = vi.hoisted(() => ({}) as Record<string, ReturnType<typeof vi.fn>>)
vi.mock("@/lib/host", async () => {
  const { createHostModuleMock } = await import("@/test/host-module-mock")
  const m = createHostModuleMock()
  Object.assign(host, m)
  return m
})
vi.mock("@/lib/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

import { RecipeDefaultsSection } from "./creator/recipe-defaults-section"
import { RecipeIdentitySection } from "./creator/recipe-identity-section"
import { RefineUsduControls } from "./workspace/refine-usdu-controls"
import { RefineModelSelect } from "./workspace/refine-model-select"
import { AdvancedControls } from "./workspace/advanced-controls"
import { PromptBar } from "./workspace/prompt-bar"
import { useRecipeBlueprintForm } from "./creator/use-recipe-blueprint-form"
import { CreatorLoraVariantsSection } from "./creator/creator-lora-variants-section"
import { ImageLightbox } from "./workspace/image-lightbox"

vi.mock("./workspace/refine-controls", () => ({
  RefineControls: () => <div>refine-mock</div>,
}))
vi.mock("@/components/libraries", () => ({
  LoraStack: () => <div>loras-mock</div>,
}))

describe("coverage gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it("recipe defaults + identity select handlers", async () => {
    const setSampler = vi.fn()
    const setScheduler = vi.fn()
    const setSteps = vi.fn()
    const setCfg = vi.fn()
    const setGuidance = vi.fn()
    const applyArch = vi.fn()
    const arch = ARCHES.find((a) => a.capabilities.negative && !a.usesGuidance)!
    render(
      <RecipeDefaultsSection
        archId={arch.id}
        arch={arch}
        sampler={arch.sampler}
        setSampler={setSampler}
        scheduler={arch.scheduler}
        setScheduler={setScheduler}
        steps={10}
        setSteps={setSteps}
        cfg={5}
        setCfg={setCfg}
        guidance={3}
        setGuidance={setGuidance}
        allowNegative
        setAllowNegative={vi.fn()}
      />
    )
    await userEvent.click(screen.getAllByText("mock-sel-item")[0])
    expect(setSampler).toHaveBeenCalledWith("euler")
    await userEvent.click(screen.getAllByText("mock-sel-item")[1])
    expect(setScheduler).toHaveBeenCalledWith("euler")
    await userEvent.click(screen.getAllByText("mock-sel-null")[0])
    await userEvent.click(screen.getAllByText("mock-num")[0])
    expect(setSteps).toHaveBeenCalledWith(7)
    await userEvent.click(screen.getAllByText("mock-num-null")[0])
    expect(setSteps).toHaveBeenCalledWith(0)
    await userEvent.click(screen.getAllByText("mock-num")[1])
    expect(setCfg).toHaveBeenCalledWith(7)
    await userEvent.click(screen.getAllByText("mock-num-null")[1])
    expect(setCfg).toHaveBeenCalledWith(0)
    cleanup()

    const guide = ARCHES.find((a) => a.usesGuidance)!
    render(
      <RecipeDefaultsSection
        archId={guide.id}
        arch={guide}
        sampler={guide.sampler}
        setSampler={setSampler}
        scheduler={guide.scheduler}
        setScheduler={setScheduler}
        steps={10}
        setSteps={setSteps}
        cfg={1}
        setCfg={setCfg}
        guidance={3}
        setGuidance={setGuidance}
        allowNegative={false}
        setAllowNegative={vi.fn()}
      />
    )
    await userEvent.click(screen.getAllByText("mock-num").at(-1)!)
    expect(setGuidance).toHaveBeenCalled()
    await userEvent.click(screen.getAllByText("mock-num-null").at(-1)!)
    expect(setGuidance).toHaveBeenCalledWith(0)
    cleanup()

    for (const id of ["flux2", "ideogram4"] as const) {
      const a = ARCHES.find((x) => x.id === id)!
      render(
        <RecipeDefaultsSection
          archId={id}
          arch={a}
          sampler={a.sampler}
          setSampler={setSampler}
          scheduler={a.scheduler}
          setScheduler={setScheduler}
          steps={10}
          setSteps={setSteps}
          cfg={1}
          setCfg={setCfg}
          guidance={3}
          setGuidance={setGuidance}
          allowNegative={false}
          setAllowNegative={vi.fn()}
        />
      )
      cleanup()
    }

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
        archId="z-image"
        applyArch={applyArch}
        description=""
        setDescription={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText("mock-sel-arch"))
    expect(applyArch).toHaveBeenCalled()
  })

  it("refine usdu/model select + advanced number/slider/text", async () => {
    const onUsduEnabledChange = vi.fn()
    const onEnsureUsdu = vi.fn()
    const onUsduScaleChange = vi.fn()
    const onUsduStepsChange = vi.fn()
    const onUsduDenoiseChange = vi.fn()
    render(
      <RefineUsduControls
        usduEnabled
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={2}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={onUsduStepsChange}
        usduDenoise={0.15}
        onUsduDenoiseChange={onUsduDenoiseChange}
        usduReady={false}
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    await userEvent.click(
      screen.getByText("mock-switch-on-Ultimate SD Upscale")
    )
    expect(onUsduEnabledChange).toHaveBeenCalledWith(true)
    expect(onEnsureUsdu).toHaveBeenCalled()
    await userEvent.click(screen.getByText("mock-sel-4"))
    expect(onUsduScaleChange).toHaveBeenCalledWith(4)
    await userEvent.click(screen.getByText("mock-sel-2"))
    expect(onUsduScaleChange).toHaveBeenCalledWith(2)
    await userEvent.click(screen.getByText("mock-sel-null"))
    await userEvent.click(screen.getByText("mock-slide-USDU steps"))
    expect(onUsduStepsChange).toHaveBeenCalledWith(12)
    await userEvent.click(screen.getByText("mock-slide-bad-USDU steps"))
    await userEvent.click(screen.getByText("mock-slide-USDU denoise"))
    expect(onUsduDenoiseChange).toHaveBeenCalled()
    await userEvent.click(screen.getByText("mock-slide-bad-USDU denoise"))
    cleanup()

    render(
      <RefineUsduControls
        usduEnabled
        onUsduEnabledChange={vi.fn()}
        usduScale={2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    onEnsureUsdu.mockClear()
    await userEvent.click(
      screen.getByText("mock-switch-on-Ultimate SD Upscale")
    )
    expect(onEnsureUsdu).not.toHaveBeenCalled()
    cleanup()

    const onModelIdChange = vi.fn()
    const onInstallModel = vi.fn()
    const models = [
      {
        id: "need",
        name: "Need",
        kind: "esrgan" as const,
        ready: false,
        description: "d",
        scale: 2,
      },
    ]
    render(
      <RefineModelSelect
        models={models}
        selected={models[0]}
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        modelInstalling={false}
        modelQueued={false}
        modelBusy={false}
        onModelIdChange={onModelIdChange}
        onInstallModel={onInstallModel}
        width={512}
        height={512}
        outW={1024}
        outH={1024}
        isSupir={false}
        usduEnabled={false}
        effectiveScale={2}
      />
    )
    await userEvent.click(screen.getByText("mock-sel-need"))
    expect(onModelIdChange).toHaveBeenCalledWith("need")
    await userEvent.click(screen.getByText("mock-sel-null"))
    await userEvent.click(
      screen.getByRole("button", { name: /Download Need/i })
    )
    expect(onInstallModel).toHaveBeenCalledWith("need")
    cleanup()

    const setControlValues = vi.fn((fn) =>
      typeof fn === "function" ? fn({ seed: 1, text: "t" }) : fn
    )
    render(
      <AdvancedControls
        controls={[
          { id: "seed", type: "number", label: "Seed", default: 0 },
          { id: "steps", type: "slider" },
          { id: "cfg_scale", type: "slider" },
          { id: "bare", type: "number" },
          { id: "text", type: "text", label: "Text", default: "" },
          { id: "bare_text", type: "text" },
        ]}
        controlValues={{
          seed: Number.NaN,
          text: "t",
        }}
        setControlValues={setControlValues}
        latestGallerySeed={1}
        supportsLoras={false}
        activeArch={null}
        loraPacks={[]}
        loraStack={[]}
        onLoraStackChange={vi.fn()}
        loraInstallingKey={null}
        loraQueuedKeys={[]}
        generating={false}
        onOpenLoraLibrary={vi.fn()}
        onInstallLoraVariant={vi.fn()}
        showInstallHint={false}
        showRefine={false}
        upscaleEnabled={false}
        onUpscaleEnabledChange={vi.fn()}
        upscaleModelId=""
        onUpscaleModelIdChange={vi.fn()}
        usduEnabled={false}
        onUsduEnabledChange={vi.fn()}
        usduScale={2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        upscaleModels={[]}
        usduReady={false}
        upscaleInstallingId={null}
        upscaleQueuedIds={[]}
        upscalePendingIds={[]}
        onInstallUpscaler={vi.fn()}
        onEnsureUsdu={vi.fn()}
      />
    )
    await userEvent.click(screen.getAllByText("mock-num-null")[0])
    await userEvent.click(screen.getByText("mock-slide-steps"))
    await userEvent.click(screen.getByText("mock-slide-bad-steps"))
    await userEvent.click(screen.getByText("mock-slide-cfg_scale"))
    await userEvent.click(screen.getByText("mock-slide-bad-cfg_scale"))
    await userEvent.click(screen.getAllByText("mock-num-null")[1])
    fireEvent.change(screen.getByDisplayValue("t"), {
      target: { value: "x" },
    })
    const bareTextLabel = screen.getByText("bare_text").closest("label")!
    fireEvent.change(within(bareTextLabel).getByRole("textbox"), {
      target: { value: "y" },
    })
    expect(setControlValues).toHaveBeenCalled()
    cleanup()
  })

  it("prompt size popover + recipe arch defaults + variants paste skip", async () => {
    const onApplySize = vi.fn()
    render(
      <PromptBar
        prompt="hi"
        onPromptChange={vi.fn()}
        showNegative
        negativePrompt="neg"
        onNegativeChange={vi.fn()}
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
        onApplySize={onApplySize}
        onGenerate={vi.fn(async () => {})}
        queuePulseToken={0}
      />
    )
    fireEvent.change(screen.getByDisplayValue("neg"), {
      target: { value: "n2" },
    })
    // aspect tiles + presets are visible via mocked Popover
    const aspectBtn = screen
      .getAllByRole("button")
      .find((b) => /16:9|4:3|3:2|1:1/.test(b.textContent ?? ""))
    if (aspectBtn) await userEvent.click(aspectBtn)
    const preset = screen
      .getAllByRole("button")
      .find((b) => b.textContent === "768")
    if (preset) await userEvent.click(preset)
    await userEvent.click(screen.getByText("mock-slide-slider"))
    expect(onApplySize).toHaveBeenCalled()
    await userEvent.click(screen.getByText("mock-slide-bad-slider"))
    cleanup()

    const { result } = renderHook(() =>
      useRecipeBlueprintForm({ onSaved: vi.fn() })
    )
    for (const id of [
      "ideogram4",
      "chroma",
      "sd3.5",
      "qwen-image",
      "krea2",
    ] as const) {
      const arch = ARCHES.find((a) => a.id === id)
      if (!arch) continue
      act(() => {
        result.current.applyArch(id)
        result.current.setName(id)
        result.current.setIdTouched(true)
        result.current.setIdManual(id)
        for (let i = 0; i < result.current.arch.slots.length; i++) {
          const slot = result.current.arch.slots[i]
          result.current.updateModelUrl(
            i,
            slot.defaultUrl ?? `https://f/${slot.role}.safetensors`
          )
        }
      })
      await act(async () => {
        await result.current.handleSave()
      })
    }
    expect(host.saveUserBlueprint).toHaveBeenCalled()
    cleanup()

    const tryExpand = vi.fn()
    render(
      <CreatorLoraVariantsSection
        variants={[
          { key: "k1", arch: "z-image", url: "" },
          { key: "k2", arch: "flux", url: "" },
        ]}
        setVariants={vi.fn()}
        usedArches={new Set(["z-image", "flux"])}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={tryExpand}
      />
    )
    fireEvent.paste(screen.getByPlaceholderText("Download URL"), {
      clipboardData: { getData: () => "https://civitai.com/models/1" },
    })
    expect(tryExpand).not.toHaveBeenCalled()
    cleanup()

    render(
      <CreatorLoraVariantsSection
        variants={[{ key: "only", arch: "z-image", url: "" }]}
        setVariants={vi.fn()}
        usedArches={new Set(["z-image"])}
        busy
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    expect(
      screen.getByRole("button", { name: /Add architecture/i })
    ).toBeDisabled()
  })

  it("lightbox releasePointerCapture catch + nudge without viewport", async () => {
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver

    const { rerender } = render(
      <ImageLightbox open onOpenChange={vi.fn()} src="/x.png" />
    )
    const img = await screen.findByAltText("Generated image")
    const vp = img.parentElement as HTMLElement
    Object.defineProperty(vp, "clientWidth", { configurable: true, value: 800 })
    Object.defineProperty(vp, "clientHeight", {
      configurable: true,
      value: 600,
    })
    vp.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    vp.setPointerCapture = vi.fn()
    vp.releasePointerCapture = vi.fn(() => {
      throw new Error("already released")
    })
    Object.defineProperty(img, "naturalWidth", {
      configurable: true,
      value: 100,
    })
    Object.defineProperty(img, "naturalHeight", {
      configurable: true,
      value: 100,
    })
    fireEvent.load(img)
    await userEvent.click(screen.getByLabelText("Zoom in"))
    fireEvent.pointerDown(vp, {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerUp(vp, { pointerId: 7, clientX: 10, clientY: 10 })

    await userEvent.click(screen.getByLabelText("Zoom in"))
    vp.remove()
    await userEvent.click(screen.getByLabelText("Zoom out"))
  })
})
