/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/host", async () => {
  const { createHostModuleMock } = await import("@/test/host-module-mock")
  return createHostModuleMock({
    parseGalleryRecipe: vi.fn((item: { metadataJson: string }) => {
      try {
        const m = JSON.parse(item.metadataJson)
        if (!m.prompt && !m.values) return null
        return {
          prompt: m.prompt ?? "",
          values: m.values ?? {},
        }
      } catch {
        return null
      }
    }),
  })
})
vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})
vi.mock("./refine-controls", () => ({
  RefineControls: () => <div>refine</div>,
}))
vi.mock("@/components/libraries", () => ({
  LoraStack: () => <div>loras</div>,
}))

import { AdvancedPanel } from "./advanced-panel"
import { AdvancedControls } from "./advanced-controls"
import { StageImage, stageFrameStyle } from "./stage-image"
import { RefineInstallButton } from "./refine-install-button"
import { GalleryPanel } from "./gallery-panel"
import { notifySuccess } from "@/lib/notify"

describe("workspace simple", () => {
  it("advanced panel + stage image + install button", async () => {
    render(
      <AdvancedPanel open>
        <span>child</span>
      </AdvancedPanel>
    )
    expect(screen.getByText("Advanced")).toBeInTheDocument()
    expect(screen.getByText("child")).toBeInTheDocument()

    expect(stageFrameStyle(16, 9).aspectRatio).toContain("16")

    const onOpen = vi.fn()
    const onLoad = vi.fn()
    const { rerender } = render(
      <StageImage
        src="/a.png"
        width={100}
        height={100}
        onOpen={onOpen}
        onLoad={onLoad}
      />
    )
    const img = screen.getByRole("button", { name: /Open fullscreen/i })
    await userEvent.click(img)
    expect(onOpen).toHaveBeenCalled()
    fireEvent.keyDown(img, { key: "Enter" })
    fireEvent.keyDown(img, { key: " " })
    fireEvent.keyDown(img, { key: "x" })
    const image = img.querySelector("img")!
    Object.defineProperty(image, "naturalWidth", { value: 200 })
    Object.defineProperty(image, "naturalHeight", { value: 100 })
    fireEvent.load(image)
    expect(onLoad).toHaveBeenCalled()

    rerender(
      <StageImage src="/b.png" width={50} height={50} overlay className="x" />
    )
    expect(document.querySelector(".pointer-events-none")).toBeTruthy()

    const onLoadZero = vi.fn()
    render(
      <StageImage
        src="/zero.png"
        width={100}
        height={100}
        onOpen={onOpen}
        onLoad={onLoadZero}
      />
    )
    const zeroImg = screen
      .getByRole("button", { name: /Open fullscreen/i })
      .querySelector("img")!
    Object.defineProperty(zeroImg, "naturalWidth", {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(zeroImg, "naturalHeight", {
      configurable: true,
      value: 0,
    })
    fireEvent.load(zeroImg)
    expect(onLoadZero).toHaveBeenCalled()

    const onInstall = vi.fn()
    const { rerender: ri } = render(
      <RefineInstallButton
        installing
        queued={false}
        busy={false}
        downloadLabel="d"
        downloadAriaLabel="d"
        queuedAriaLabel="q"
        installingAriaLabel="i"
        onInstall={onInstall}
      />
    )
    expect(screen.getByLabelText("i")).toBeDisabled()
    ri(
      <RefineInstallButton
        installing={false}
        queued
        busy={false}
        downloadLabel="d"
        downloadAriaLabel="d"
        queuedAriaLabel="q"
        installingAriaLabel="i"
        onInstall={onInstall}
      />
    )
    expect(screen.getByLabelText("q")).toBeDisabled()
    ri(
      <RefineInstallButton
        installing={false}
        queued={false}
        busy={false}
        downloadLabel="d"
        downloadAriaLabel="d"
        queuedAriaLabel="q"
        installingAriaLabel="i"
        onInstall={onInstall}
      />
    )
    await userEvent.click(screen.getByLabelText("d"))
    expect(onInstall).toHaveBeenCalled()
  })

  it("advanced controls branches", async () => {
    const setControlValues = vi.fn((fn) =>
      typeof fn === "function" ? fn({}) : fn
    )
    render(
      <AdvancedControls
        controls={[
          { id: "seed", type: "number", label: "Seed", default: 0 },
          { id: "steps", type: "slider", label: "Steps", default: 8 },
          { id: "cfg", type: "slider", label: "CFG", default: 1 },
          { id: "other", type: "number", label: "Other", default: 1 },
          { id: "text", type: "text", label: "Text", default: "" },
        ]}
        controlValues={{ seed: 1, steps: 8, cfg: 2, other: 1, text: "t" }}
        setControlValues={setControlValues}
        latestGallerySeed={42}
        supportsLoras
        activeArch="z-image"
        loraPacks={[]}
        loraStack={[]}
        onLoraStackChange={vi.fn()}
        loraInstallingKey={null}
        loraQueuedKeys={[]}
        generating={false}
        onOpenLoraLibrary={vi.fn()}
        onInstallLoraVariant={vi.fn()}
        showInstallHint
        showRefine
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
    expect(screen.getByText("refine")).toBeInTheDocument()
    expect(screen.getByText("loras")).toBeInTheDocument()
    expect(screen.getByText(/Models not installed yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText("Random seed"))
    expect(setControlValues).toHaveBeenCalled()
    await userEvent.click(
      screen.getByLabelText("Use seed from last gallery image")
    )
    expect(notifySuccess).toHaveBeenCalled()

    render(
      <AdvancedControls
        controls={[
          { id: "cfg_scale", type: "slider", label: "CFG", default: 1 },
          { id: "other", type: "number", label: "Other", default: 1 },
          { id: "note", type: "text", label: "", default: "" },
        ]}
        controlValues={{ cfg_scale: Number.NaN, other: 3, note: "x" }}
        setControlValues={setControlValues}
        latestGallerySeed={null}
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
    fireEvent.change(screen.getByDisplayValue("x"), {
      target: { value: "y" },
    })
    expect(setControlValues).toHaveBeenCalled()

    render(
      <AdvancedControls
        controls={[]}
        controlValues={{}}
        setControlValues={setControlValues}
        latestGallerySeed={null}
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
    expect(screen.getByText(/No advanced controls/i)).toBeInTheDocument()

    render(
      <AdvancedControls
        controls={[{ id: "seed", type: "number", label: "Seed", default: 0 }]}
        controlValues={{ seed: 1 }}
        setControlValues={setControlValues}
        latestGallerySeed={null}
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
    expect(
      screen.getAllByLabelText("Use seed from last gallery image").at(-1)
    ).toBeDisabled()
  })

  it("gallery panel tiles and live", async () => {
    const item = {
      id: "g1",
      path: "/a.png",
      thumbnailPath: "/t.png",
      jobId: null,
      createdAt: 0,
      metadataJson: JSON.stringify({ prompt: "hi", values: { seed: 1 } }),
    }
    const onSelect = vi.fn()
    const onDelete = vi.fn(async () => {})
    const onCopy = vi.fn()
    const onReveal = vi.fn()
    const onReusePrompt = vi.fn()
    const onReuseSettings = vi.fn()
    const onImageToPrompt = vi.fn()
    const onSelectLive = vi.fn()

    const { rerender } = render(
      <GalleryPanel
        open
        items={[]}
        selectedId={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
      />
    )
    expect(screen.getByText(/Generate something/i)).toBeInTheDocument()

    rerender(
      <GalleryPanel
        open
        items={[item]}
        selectedId="g1"
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
        onImageToPrompt={onImageToPrompt}
        showLive
        livePreviewSrc="/live.png"
        followLive={false}
        onSelectLive={onSelectLive}
      />
    )
    await userEvent.click(screen.getByLabelText("Deselect image"))
    expect(onSelect).toHaveBeenCalledWith(null)
    await userEvent.click(screen.getByLabelText("Copy to clipboard"))
    expect(onCopy).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Image to Prompt"))
    expect(onImageToPrompt).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Reuse prompt"))
    expect(onReusePrompt).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Reuse all settings"))
    expect(onReuseSettings).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Delete"))
    expect(onDelete).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Reveal in Explorer"))
    expect(onReveal).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Follow live preview"))
    expect(onSelectLive).toHaveBeenCalled()

    rerender(
      <GalleryPanel
        open
        items={[item]}
        selectedId={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
        showLive
        livePreviewSrc={null}
        followLive
        onSelectLive={onSelectLive}
      />
    )
    expect(
      screen.getByLabelText("Stop following live preview")
    ).toBeInTheDocument()

    rerender(
      <GalleryPanel
        open
        items={[
          {
            ...item,
            metadataJson: "{}",
          },
        ]}
        selectedId="g1"
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
      />
    )
    expect(screen.queryByLabelText("Reuse all settings")).toBeNull()

    rerender(
      <GalleryPanel
        open
        items={[
          {
            ...item,
            thumbnailPath: null,
            metadataJson: JSON.stringify({ values: { seed: 1 } }),
          },
        ]}
        selectedId={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
      />
    )
    await userEvent.click(screen.getByLabelText("Select image"))
    expect(onSelect).toHaveBeenCalledWith("g1")

    rerender(
      <GalleryPanel
        open
        items={[item]}
        selectedId={null}
        onSelect={onSelect}
        onDelete={onDelete}
        onCopy={onCopy}
        onReveal={onReveal}
        onReusePrompt={onReusePrompt}
        onReuseSettings={onReuseSettings}
        showLive
        livePreviewSrc="/live.png"
        followLive={false}
      />
    )
    expect(screen.queryByLabelText("Follow live preview")).toBeNull()
  })
})
