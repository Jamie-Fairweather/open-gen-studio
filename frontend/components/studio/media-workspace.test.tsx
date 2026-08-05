/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const stage = {
  showLiveStage: false,
  livePreviewSrc: null as string | null,
  pendingPreviewSrc: null as string | null,
  previewItem: { id: "g1", path: "/a.png" } as {
    id: string
    path: string
  } | null,
  gallerySrc: (p: string) => `asset://${p}`,
  stageDims: { width: 512, height: 512 },
  studioLabel: "Image",
  setLightboxOpen: vi.fn(),
  promotePendingPreview: vi.fn(),
  stageInsetLeft: 0,
  stageInsetRight: 0,
  showAdvancedRail: true,
  showGalleryRail: true,
  sideRailWidth: 320,
  showLiveGhost: true,
  followLive: false,
  enterFollowLive: vi.fn(),
  stageSrc: "asset:///a.png",
  lightboxOpen: false,
}

const advanced = {
  open: true,
  setOpen: vi.fn((fn) => (typeof fn === "function" ? fn(false) : fn)),
  controlValues: { width: 512, height: 512 },
  setControlValues: vi.fn(),
  loraPacks: [],
  setLoraStack: vi.fn(),
  setLoraPickerOpen: vi.fn(),
  beginLoraInstall: vi.fn(async () => {}),
  generating: false,
  isInstalled: vi.fn(() => false),
  upscaleEnabled: false,
  setUpscaleEnabled: vi.fn(),
  upscaleModelId: "m1",
  setUpscaleModelId: vi.fn(),
  usduEnabled: false,
  setUsduEnabled: vi.fn(),
  usduScale: 2 as const,
  setUsduScale: vi.fn(),
  usduSteps: 8,
  setUsduSteps: vi.fn(),
  usduDenoise: 0.15,
  setUsduDenoise: vi.fn(),
  upscaleModels: [
    { id: "supir", kind: "supir", name: "SUPIR" },
    { id: "other-up", kind: "esrgan", name: "Other" },
  ],
  usduReady: true,
  beginUpscaleInstall: vi.fn(async () => {}),
  beginUsduInstall: vi.fn(async () => {}),
}

const gallery = {
  open: true,
  setOpen: vi.fn((fn) => (typeof fn === "function" ? fn(false) : fn)),
  selectedId: "g1",
  selectItem: vi.fn(),
  onDelete: vi.fn(),
  onCopy: vi.fn(),
  onReveal: vi.fn(),
  onReusePrompt: vi.fn(),
  onReuseSettings: vi.fn(),
  openImageToPrompt: vi.fn(),
}

vi.mock("./use-media-stage-props", () => ({
  useMediaStageProps: () => stage,
}))
vi.mock("./use-advanced-rail-props", () => ({
  useAdvancedRailProps: () => ({
    studioTab: "image",
    selected: { id: "bp1" },
    advanced,
    advancedControls: [],
    latestGallerySeed: null,
    supportsLoras: true,
    activeArch: "z-image",
    activeLoraStack: [{ id: "l1", strength: 1 }],
    loraInstallingKey: null,
    loraQueuedKeys: [],
    upscaleInstallingId: null,
    upscaleQueuedIds: [],
    upscalePendingIds: [],
  }),
}))
vi.mock("./use-gallery-rail-props", () => ({
  useGalleryRailProps: () => ({
    gallery,
    tabGallery: [{ id: "g1", path: "/a.png" }],
  }),
}))
vi.mock("@/components/workspace", () => ({
  AdvancedControls: (props: Record<string, unknown>) => (
    <div
      data-testid="advanced-controls-root"
      data-refine-w={String(props.refineWidth ?? "")}
      data-refine-h={String(props.refineHeight ?? "")}
    >
      <button
        type="button"
        onClick={() =>
          (props.onInstallLoraVariant as (id: string, arch: string) => void)(
            "l1",
            "z-image"
          )
        }
      >
        install-lora
      </button>
      <button
        type="button"
        onClick={() =>
          (props.onInstallLoraVariant as (id: string, arch: string) => void)(
            "l1",
            "not-arch"
          )
        }
      >
        install-bad-arch
      </button>
      <button
        type="button"
        onClick={() =>
          (props.onUpscaleModelIdChange as (id: string) => void)("supir")
        }
      >
        pick-supir
      </button>
      <button
        type="button"
        onClick={() =>
          (props.onUpscaleModelIdChange as (id: string) => void)("other-up")
        }
      >
        pick-other-up
      </button>
      <button
        type="button"
        onClick={() => (props.onInstallUpscaler as (id: string) => void)("m1")}
      >
        install-up
      </button>
      <button
        type="button"
        onClick={() => (props.onEnsureUsdu as () => void)()}
      >
        ensure-usdu
      </button>
      <button
        type="button"
        onClick={() => (props.onOpenLoraLibrary as () => void)()}
      >
        open-lora
      </button>
    </div>
  ),
  AdvancedPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  GalleryPanel: (props: Record<string, unknown>) => (
    <div>
      <button
        type="button"
        onClick={() =>
          (props.onImageToPrompt as (i: { path: string }) => void)({
            path: "/a.png",
          })
        }
      >
        tip
      </button>
      <button
        type="button"
        onClick={() => (props.onSelectLive as () => void)()}
      >
        live
      </button>
    </div>
  ),
  ImageLightbox: (props: {
    onImageToPrompt?: () => void
    onOpenChange: (o: boolean) => void
  }) => (
    <button
      type="button"
      onClick={() => {
        props.onImageToPrompt?.()
        props.onOpenChange(false)
      }}
    >
      lightbox
    </button>
  ),
  StudioPromptBar: () => <div>prompt</div>,
}))
vi.mock("./media-stage", () => ({
  MediaStage: (props: { onOpenLightbox: () => void }) => (
    <button type="button" onClick={props.onOpenLightbox}>
      stage
    </button>
  ),
}))
vi.mock("@/components/shell", () => ({
  SideRailHandle: ({
    children,
    onClick,
    "aria-label": label,
  }: {
    children: React.ReactNode
    onClick: () => void
    "aria-label"?: string
  }) => (
    <button type="button" onClick={onClick} aria-label={label}>
      {children}
    </button>
  ),
}))
vi.mock("@/lib/arch", () => ({
  isRecipeArch: (a: string) => a === "z-image",
}))

import { MediaWorkspace } from "./media-workspace"

describe("MediaWorkspace", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    stage.followLive = false
    stage.showLiveStage = false
    stage.showAdvancedRail = true
    stage.showGalleryRail = true
    stage.previewItem = { id: "g1", path: "/a.png" }
    stage.stageSrc = "asset:///a.png"
    advanced.open = true
    gallery.open = true
    advanced.isInstalled = vi.fn(() => false)
    advanced.controlValues = { width: 512, height: 512 }
  })
  afterEach(() => cleanup())

  it("wires rails, controls, lightbox", async () => {
    const r1 = render(<MediaWorkspace category="image" />)
    expect(screen.getByText("prompt")).toBeInTheDocument()
    await userEvent.click(screen.getByText("stage"))
    expect(stage.setLightboxOpen).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByLabelText("Close advanced"))
    expect(advanced.setOpen).toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText("Close gallery"))
    expect(gallery.setOpen).toHaveBeenCalled()

    advanced.open = false
    gallery.open = false
    const rClosed = render(<MediaWorkspace category="image" />)
    await userEvent.click(rClosed.getByLabelText("Open advanced"))
    await userEvent.click(rClosed.getByLabelText("Open gallery"))
    rClosed.unmount()
    advanced.open = true
    gallery.open = true

    advanced.controlValues = { width: 0, height: Number.NaN }
    cleanup()
    const rDims = render(<MediaWorkspace category="image" />)
    const controls = rDims.container.querySelector(
      '[data-testid="advanced-controls-root"]'
    )
    expect(controls?.getAttribute("data-refine-w")).toBe("512")
    expect(controls?.getAttribute("data-refine-h")).toBe("512")
    rDims.unmount()
    advanced.controlValues = { width: 512, height: 512 }

    const r1b = render(<MediaWorkspace category="image" />)
    await userEvent.click(r1b.getByText("install-lora"))
    expect(advanced.beginLoraInstall).toHaveBeenCalled()
    await userEvent.click(r1b.getByText("install-bad-arch"))
    await userEvent.click(r1b.getByText("pick-supir"))
    expect(advanced.setUpscaleModelId).toHaveBeenCalledWith("supir")
    expect(advanced.setUsduEnabled).toHaveBeenCalledWith(false)
    await userEvent.click(r1b.getByText("pick-other-up"))
    expect(advanced.setUpscaleModelId).toHaveBeenCalledWith("other-up")
    await userEvent.click(r1b.getByText("install-up"))
    expect(advanced.beginUpscaleInstall).toHaveBeenCalled()
    await userEvent.click(r1b.getByText("ensure-usdu"))
    expect(advanced.beginUsduInstall).toHaveBeenCalled()
    await userEvent.click(r1b.getByText("open-lora"))
    expect(advanced.setLoraPickerOpen).toHaveBeenCalledWith(true)

    await userEvent.click(r1b.getByText("tip"))
    expect(gallery.openImageToPrompt).toHaveBeenCalled()
    await userEvent.click(r1b.getByText("live"))
    expect(stage.enterFollowLive).toHaveBeenCalled()
    await userEvent.click(r1b.getByText("lightbox"))
    r1.unmount()
    r1b.unmount()

    stage.followLive = true
    const r2 = render(<MediaWorkspace category="video" />)
    await userEvent.click(screen.getByText("live"))
    expect(gallery.selectItem).toHaveBeenCalled()
    r2.unmount()

    stage.showLiveStage = true
    stage.previewItem = { id: "g1", path: "/a.png" }
    gallery.openImageToPrompt.mockClear()
    render(<MediaWorkspace category="audio" />)
    await userEvent.click(screen.getByText("lightbox"))
    expect(gallery.openImageToPrompt).not.toHaveBeenCalled()

    stage.showAdvancedRail = false
    stage.showGalleryRail = false
    stage.stageSrc = null
    stage.previewItem = null
    advanced.controlValues = { width: Number.NaN, height: Number.NaN }
    advanced.isInstalled = vi.fn(() => true)
    cleanup()
    const rMinimal = render(<MediaWorkspace category="image" />)
    expect(rMinimal.queryByText("install-lora")).toBeNull()
    expect(rMinimal.queryByText("lightbox")).toBeNull()
  })
})
