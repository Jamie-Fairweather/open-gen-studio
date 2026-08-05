/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { state, router, searchEdit, notifyError } = vi.hoisted(() => {
  const state: Record<string, unknown> = {}
  return {
    state,
    router: { replace: vi.fn(), push: vi.fn() },
    searchEdit: { value: null as string | null },
    notifyError: vi.fn(),
  }
})

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => ({
    get: (k: string) => (k === "edit" ? searchEdit.value : null),
  }),
  usePathname: () => "/image",
}))
vi.mock("next/font/google", () => ({
  Outfit: () => ({ variable: "--font-sans", className: "" }),
  Geist_Mono: () => ({ variable: "--font-mono", className: "" }),
}))
vi.mock("./globals.css", () => ({}))
vi.mock("@/components/shell", () => ({
  NativeChrome: () => <div>native</div>,
}))
vi.mock("@/components/shell/startup-overlay", () => ({
  StartupOverlay: () => <div>startup</div>,
}))
vi.mock("@/components/ui/toast", () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  AnchoredToastProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock("@/components/studio/media-workspace", () => ({
  MediaWorkspace: ({ category }: { category: string }) => (
    <div>media-{category}</div>
  ),
}))
vi.mock("@/components/creator", () => ({
  CreatorPanel: (p: {
    onEditCleared?: () => void
    onBlueprintsChanged?: () => void
  }) => (
    <div>
      <span>creator-panel</span>
      <button type="button" onClick={() => p.onEditCleared?.()}>
        clear-edit
      </button>
      <button type="button" onClick={() => p.onBlueprintsChanged?.()}>
        bp-changed
      </button>
    </div>
  ),
}))
vi.mock("@/components/settings", () => ({
  SettingsPanel: (p: Record<string, unknown>) => (
    <div>
      <button type="button" onClick={() => (p.onBrowseModels as () => void)()}>
        browse
      </button>
      <button
        type="button"
        onClick={() => (p.onHfTokenChange as (v: string) => void)("hf")}
      >
        hf
      </button>
      <button
        type="button"
        onClick={() => (p.onCivitaiTokenChange as (v: string) => void)("cv")}
      >
        cv
      </button>
      <button type="button" onClick={() => (p.onInstallComfy as () => void)()}>
        install
      </button>
      <button type="button" onClick={() => (p.onStartComfy as () => void)()}>
        start
      </button>
      <button type="button" onClick={() => (p.onStopComfy as () => void)()}>
        stop
      </button>
      <button type="button" onClick={() => (p.onSaveHfToken as () => void)()}>
        save-hf
      </button>
      <button type="button" onClick={() => (p.onClearHfToken as () => void)()}>
        clear-hf
      </button>
      <button
        type="button"
        onClick={() => (p.onSaveCivitaiToken as () => void)()}
      >
        save-cv
      </button>
      <button
        type="button"
        onClick={() => (p.onClearCivitaiToken as () => void)()}
      >
        clear-cv
      </button>
    </div>
  ),
}))
vi.mock("@/components/libraries", () => ({
  DownloadsPanel: (p: {
    banner: React.ReactNode
    onPause: (id: string) => void
    onResume: (id: string) => void
    onCancel: (id: string) => void
    onOpenBlueprints: () => void
  }) => (
    <div>
      {p.banner}
      <button type="button" onClick={() => p.onPause("j1")}>
        pause
      </button>
      <button type="button" onClick={() => p.onResume("j1")}>
        resume
      </button>
      <button type="button" onClick={() => p.onCancel("j1")}>
        cancel
      </button>
      <button type="button" onClick={p.onOpenBlueprints}>
        blueprints
      </button>
    </div>
  ),
}))
vi.mock("@/components/tools/tools-index", () => ({
  ToolsIndex: () => <div>tools-index</div>,
}))
vi.mock("@/components/tools/image-to-prompt-panel", () => ({
  ImageToPromptPanel: () => <div>i2p</div>,
}))
vi.mock("@/components/tools/prompt-enhancer-panel", () => ({
  PromptEnhancerPanel: () => <div>pe</div>,
}))
vi.mock("@/components/studio/studio-bootstrap", () => ({
  StudioBootstrap: ({ children }: { children: React.ReactNode }) => (
    <div>boot{children}</div>
  ),
}))
vi.mock("@/components/studio/studio-chrome", () => ({
  StudioChrome: ({ children }: { children: React.ReactNode }) => (
    <div>chrome{children}</div>
  ),
}))
vi.mock("@/components/studio/store", () => ({
  useStudioStore: Object.assign(
    (sel: (s: Record<string, unknown>) => unknown) => sel(state),
    { getState: () => state }
  ),
  useStudioSelector: (sel: (s: Record<string, unknown>) => unknown) =>
    sel(state),
}))
vi.mock("@/components/studio/selectors", () => ({
  selectComfy: () => ({ status: "stopped" }),
}))
vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
}))

import RootLayout from "./layout"
import HomePage from "./page"
import StudioLayout from "./(studio)/layout"
import ImagePage from "./(studio)/image/page"
import VideoPage from "./(studio)/video/page"
import AudioPage from "./(studio)/audio/page"
import CreatorPage from "./(studio)/creator/page"
import SettingsPage from "./(studio)/settings/page"
import DownloadsPage from "./(studio)/downloads/page"
import ToolsPage from "./(studio)/tools/page"
import ImageToPromptPage from "./(studio)/tools/image-to-prompt/page"
import PromptEnhancerPage from "./(studio)/tools/prompt-enhancer/page"

describe("app pages", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    searchEdit.value = null
    try {
      localStorage.removeItem("downloads_provider_keys_warning_dismissed")
    } catch {
      /* jsdom stub */
    }
    Object.assign(state, {
      editBlueprintId: null,
      setEditBlueprintId: vi.fn(),
      refreshBlueprints: vi.fn(),
      setModelsOpen: vi.fn(),
      downloadSnapshot: { active: null, queued: [], history: [] },
      downloadSpeedBps: 0,
      runtimeMessage: "rt",
      hasHfToken: false,
      hasCivitaiToken: false,
      pauseDownload: vi.fn(async () => {}),
      resumeDownload: vi.fn(async () => {}),
      cancelDownload: vi.fn(async () => {}),
      setPickerOpen: vi.fn(),
      navigateTab: vi.fn(),
      comfyHealthy: false,
      runtimeBusy: false,
      handleInstallComfy: vi.fn(async () => {}),
      handleStartComfy: vi.fn(async () => {}),
      handleStopComfy: vi.fn(async () => {}),
      hfToken: "",
      setHfToken: vi.fn(),
      setHfTokenDirty: vi.fn(),
      hfTokenDirty: false,
      hfTokenSaving: false,
      handleSaveHfToken: vi.fn(async () => {}),
      handleClearHfToken: vi.fn(async () => {}),
      civitaiToken: "",
      setCivitaiToken: vi.fn(),
      setCivitaiTokenDirty: vi.fn(),
      civitaiTokenDirty: false,
      civitaiTokenSaving: false,
      handleSaveCivitaiToken: vi.fn(async () => {}),
      handleClearCivitaiToken: vi.fn(async () => {}),
      gpu: null,
    })
  })

  it("renders every route", async () => {
    render(
      <RootLayout>
        <span>root-child</span>
      </RootLayout>
    )
    expect(screen.getByText("root-child")).toBeInTheDocument()

    render(<HomePage />)
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/image"))

    render(
      <StudioLayout>
        <span>studio-child</span>
      </StudioLayout>
    )
    expect(screen.getByText("studio-child")).toBeInTheDocument()

    expect(render(<ImagePage />).getByText("media-image")).toBeTruthy()
    expect(render(<VideoPage />).getByText("media-video")).toBeTruthy()
    expect(render(<AudioPage />).getByText("media-audio")).toBeTruthy()
    expect(render(<ToolsPage />).getByText("tools-index")).toBeTruthy()
    expect(render(<ImageToPromptPage />).getByText("i2p")).toBeTruthy()
    expect(render(<PromptEnhancerPage />).getByText("pe")).toBeTruthy()

    searchEdit.value = "bp1"
    const creatorWithEdit = render(<CreatorPage />)
    await waitFor(() =>
      expect(state.setEditBlueprintId).toHaveBeenCalledWith("bp1")
    )
    expect(creatorWithEdit.getByText("creator-panel")).toBeInTheDocument()
    creatorWithEdit.unmount()

    ;(state.setEditBlueprintId as ReturnType<typeof vi.fn>).mockClear()
    searchEdit.value = null
    const creatorNoEdit = render(<CreatorPage />)
    await waitFor(() => expect(state.setEditBlueprintId).not.toHaveBeenCalled())
    creatorNoEdit.unmount()

    searchEdit.value = "bp1"
    const creatorActions = render(<CreatorPage />)
    await userEvent.click(creatorActions.getByText("clear-edit"))
    expect(state.setEditBlueprintId).toHaveBeenCalledWith(null)
    await userEvent.click(creatorActions.getByText("bp-changed"))
    expect(state.refreshBlueprints).toHaveBeenCalled()

    render(<SettingsPage />)
    await userEvent.click(screen.getByText("browse"))
    expect(state.setModelsOpen).toHaveBeenCalledWith(true)
    await userEvent.click(screen.getByText("hf"))
    await userEvent.click(screen.getByText("cv"))
    await userEvent.click(screen.getByText("install"))
    await userEvent.click(screen.getByText("start"))
    await userEvent.click(screen.getByText("stop"))
    await userEvent.click(screen.getByText("save-hf"))
    await userEvent.click(screen.getByText("clear-hf"))
    await userEvent.click(screen.getByText("save-cv"))
    await userEvent.click(screen.getByText("clear-cv"))

    Object.assign(state, {
      downloadSnapshot: {
        active: {
          kind: "runtime",
          steps: [{ status: "running", stepKind: "git" }],
        },
        queued: [],
        history: [],
      },
      hasHfToken: false,
      hasCivitaiToken: false,
    })
    const d1 = render(<DownloadsPage />)
    expect(d1.getByText(/Add API keys/i)).toBeInTheDocument()
    await userEvent.click(d1.getByText("Open Settings"))
    expect(state.navigateTab).toHaveBeenCalledWith("settings")
    await userEvent.click(d1.getByText(/Don't tell me again/i))
    d1.unmount()

    Object.assign(state, {
      hasHfToken: true,
      hasCivitaiToken: false,
      downloadSnapshot: {
        active: {
          kind: "runtime",
          steps: [{ status: "paused", stepKind: "git" }],
        },
        queued: [],
        history: [],
      },
    })
    try {
      localStorage.removeItem("downloads_provider_keys_warning_dismissed")
    } catch {
      /* ignore */
    }
    const d1b = render(<DownloadsPage />)
    expect(d1b.getByText(/Add API keys/i)).toBeInTheDocument()
    d1b.unmount()

    Object.assign(state, {
      hasHfToken: true,
      hasCivitaiToken: true,
      downloadSnapshot: {
        active: {
          kind: "runtime",
          steps: [{ status: "running", stepKind: "http" }],
        },
        queued: [],
        history: [],
      },
    })
    const d1c = render(<DownloadsPage />)
    expect(d1c.queryByText(/Add API keys/i)).toBeNull()
    d1c.unmount()

    Object.assign(state, {
      pauseDownload: vi
        .fn()
        .mockRejectedValueOnce(new Error("pause"))
        .mockRejectedValueOnce("pause-str"),
      resumeDownload: vi
        .fn()
        .mockRejectedValueOnce(new Error("resume"))
        .mockRejectedValueOnce("resume-str"),
      cancelDownload: vi
        .fn()
        .mockRejectedValueOnce(new Error("cancel"))
        .mockRejectedValueOnce("cancel-str"),
      hasHfToken: true,
      hasCivitaiToken: true,
    })
    try {
      localStorage.setItem("downloads_provider_keys_warning_dismissed", "1")
    } catch {
      /* ignore */
    }
    const d2 = render(<DownloadsPage />)
    await userEvent.click(d2.getByText("pause"))
    await userEvent.click(d2.getByText("pause"))
    await userEvent.click(d2.getByText("resume"))
    await userEvent.click(d2.getByText("resume"))
    await userEvent.click(d2.getByText("cancel"))
    await userEvent.click(d2.getByText("cancel"))
    await userEvent.click(d2.getByText("blueprints"))
    await waitFor(() => expect(notifyError).toHaveBeenCalled())

    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage")
      })
    render(<DownloadsPage />)
    getItem.mockRestore()
  })
})
