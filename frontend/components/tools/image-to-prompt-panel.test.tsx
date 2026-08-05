import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { emptyStructuredFields } from "@/lib/prompt-tools"

const isTauri = vi.fn(() => true)
const saveTempToolImage = vi.fn(async () => "/tmp/x.png")
const notifySuccess = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    isTauri: () => isTauri(),
    saveTempToolImage: (...a: unknown[]) => saveTempToolImage(...a),
    gallerySrc: (p: string) => `asset://${p}`,
    galleryItemCategory: (item: { path: string }) =>
      item.path.includes("vid") ? "video" : "image",
    listPromptToolWeights: vi.fn(async () => [
      {
        id: "qwenvl",
        provider: "qwenvl",
        name: "Qwen",
        description: "d",
        ready: true,
      },
    ]),
  })
})

vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
  notifyError: vi.fn(),
}))

vi.mock(
  "@/components/studio/slices/session-persist",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/components/studio/slices/session-persist")
      >()
    return { ...actual, bindSessionPersist: vi.fn() }
  }
)

import { useStudioStore } from "@/components/studio/store"
import { ImageToPromptPanel } from "./image-to-prompt-panel"

describe("ImageToPromptPanel", () => {
  beforeEach(() => {
    isTauri.mockReturnValue(true)
    saveTempToolImage.mockReset().mockResolvedValue("/tmp/x.png")
    notifySuccess.mockReset()
    const tip = useStudioStore.getState().imageToPrompt
    useStudioStore.setState({
      gallery: [
        {
          id: "g1",
          jobId: null,
          path: "/img.png",
          thumbnailPath: "/t.png",
          metadataJson: "{}",
          createdAt: 0,
        },
        {
          id: "g2",
          jobId: null,
          path: "/vid.mp4",
          thumbnailPath: null,
          metadataJson: "{}",
          createdAt: 0,
        },
      ],
      imageToPrompt: {
        ...tip,
        imagePath: null,
        previewUrl: null,
        format: "general",
        target: "auto",
        result: "",
        negative: null,
        fields: null,
        busy: false,
        status: null,
        error: null,
        jobId: null,
        galleryOpen: false,
      },
      downloadSnapshot: { active: null, queued: [], history: [] },
      detail: null,
      selectedId: null,
      blueprints: [],
    })
    useStudioStore.getState().setToolsHandoff({ imagePath: "/handoff.png" })
  })

  it("seeds target from active arch when no handoff", async () => {
    useStudioStore.getState().setToolsHandoff(null)
    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        target: "auto",
        busy: false,
      },
      detail: {
        id: "bp1",
        name: "BP",
        category: "image",
        description: "",
        runtime: "comfy",
        minimumVramGb: null,
        modelCount: 1,
        modelsReady: 1,
        controls: [],
        arch: "flux",
      },
      selectedId: "bp1",
      blueprints: [
        {
          id: "bp1",
          name: "BP",
          category: "image",
          description: "",
          arch: "flux",
          runtime: "comfy",
          source: "official",
          minimumVramGb: null,
          modelCount: 1,
          modelsReady: 1,
          totalSizeBytes: null,
          localSizeBytes: 0,
          dir: "/d",
          thumbnailPath: null,
        },
      ],
      studioTab: "image",
    })
    render(<ImageToPromptPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.target).not.toBe("auto")
    )
  })

  it("seeds handoff, gallery, paste tip, result edit", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    })

    render(<ImageToPromptPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.imagePath).toBe(
        "/handoff.png"
      )
    )

    await user.click(screen.getByRole("button", { name: /Paste/i }))
    expect(notifySuccess).toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: /Gallery/i }))
    const thumbs = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("img"))
    expect(thumbs.length).toBeGreaterThan(0)
    await user.click(thumbs[0]!)

    await user.click(screen.getByLabelText("Clear image"))
    expect(useStudioStore.getState().imageToPrompt.imagePath).toBeNull()

    useStudioStore.setState({ gallery: [] })
    await user.click(screen.getByRole("button", { name: /Gallery/i }))
    expect(screen.getByText(/No gallery images yet/)).toBeTruthy()

    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        format: "structured",
        result: "r",
        fields: { ...emptyStructuredFields(), Subject: "s" },
        galleryOpen: false,
      },
    })
    await waitFor(() => expect(screen.getByText("Subject")).toBeTruthy())
    await user.type(screen.getAllByRole("textbox")[0]!, "x")

    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        format: "general",
        fields: null,
        result: "plain",
      },
    })
    await waitFor(() => expect(screen.getByDisplayValue("plain")).toBeTruthy())
    fireEvent.change(screen.getByDisplayValue("plain"), {
      target: { value: "edited" },
    })
    expect(useStudioStore.getState().imageToPrompt.result).toBe("edited")

    await user.click(screen.getByRole("button", { name: /Upload/i }))
    await user.click(screen.getByRole("radio", { name: /JSON/i }))
    await user.click(screen.getByRole("radio", { name: /Flux/i }))

    const run = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    useStudioStore.setState({
      runImageToPromptTool: run,
      cancelImageToPromptTool: cancel,
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        imagePath: "/x.png",
        previewUrl: "asset:///x.png",
        result: "out",
        busy: true,
        jobId: "job-tip",
        status: "Working",
      },
    } as never)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy()
    )
    await user.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(cancel).toHaveBeenCalled()

    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        busy: false,
        result: "ready",
        imagePath: "/x.png",
      },
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Generate$/i })).toBeEnabled()
    )
    await user.click(screen.getByRole("button", { name: /^Generate$/i }))
    expect(run).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Use in Studio/i }))
  })

  it("upload requires tauri and drop/paste ingest", async () => {
    const user = userEvent.setup()
    useStudioStore.getState().setToolsHandoff(null)
    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        imagePath: null,
        previewUrl: null,
        error: null,
      },
    })
    render(<ImageToPromptPanel />)
    await waitFor(() => expect(screen.getByText(/Drop, paste/)).toBeTruthy())

    isTauri.mockReturnValue(false)
    const file = new File(["x"], "a.png", { type: "image/png" })
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    await user.upload(input, file)
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.error).toMatch(/desktop/)
    )

    isTauri.mockReturnValue(true)
    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        error: null,
        imagePath: null,
        previewUrl: null,
      },
    })
    await waitFor(() => expect(screen.getByText(/Drop, paste/)).toBeTruthy())
    const dropZone = screen.getByText(/Drop, paste/).parentElement!
    fireEvent.dragOver(dropZone)
    saveTempToolImage.mockRejectedValueOnce(new Error("save fail"))
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.error).toBe("save fail")
    )

    saveTempToolImage.mockResolvedValueOnce("/tmp/ok.png")
    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        error: null,
      },
    })
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.imagePath).toBe(
        "/tmp/ok.png"
      )
    )

    const paste = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(paste, "clipboardData", {
      value: {
        items: [{ type: "image/png", getAsFile: () => file }],
      },
    })
    window.dispatchEvent(paste)
  })

  it("covers file ext fallback, paste without items, and structured null fields", async () => {
    useStudioStore.getState().setToolsHandoff(null)
    useStudioStore.setState({
      gallery: [
        {
          id: "g3",
          jobId: null,
          path: "/only-path.png",
          thumbnailPath: null,
          metadataJson: "{}",
          createdAt: 0,
        },
      ],
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        imagePath: null,
        previewUrl: null,
        busy: false,
        target: "auto",
      },
    })
    render(<ImageToPromptPanel />)
    await waitFor(() => expect(screen.getByText(/Drop, paste/)).toBeTruthy())

    const fileNoExt = new File(["x"], "", { type: "image/jpeg" })
    saveTempToolImage.mockResolvedValueOnce("/tmp/jpeg.png")
    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    await userEvent.upload(input, fileNoExt)
    await waitFor(() =>
      expect(saveTempToolImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        "jpeg"
      )
    )

    saveTempToolImage.mockRejectedValueOnce("upload str")
    await userEvent.upload(
      input,
      new File(["x"], "a.png", { type: "image/png" })
    )
    await waitFor(() =>
      expect(useStudioStore.getState().imageToPrompt.error).toBe("upload str")
    )

    await userEvent.click(screen.getByLabelText("Clear image"))
    await waitFor(() => expect(screen.getByText(/Drop, paste/)).toBeTruthy())

    const dropZone =
      screen.getByText(/Drop, paste/).parentElement!.parentElement!
    fireEvent.drop(dropZone, {
      dataTransfer: {
        files: [new File(["x"], "doc.txt", { type: "text/plain" })],
      },
    })

    const emptyPaste = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(emptyPaste, "clipboardData", { value: { items: [] } })
    window.dispatchEvent(emptyPaste)

    const noClipboard = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(noClipboard, "clipboardData", { value: null })
    window.dispatchEvent(noClipboard)

    const textPaste = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(textPaste, "clipboardData", {
      value: { items: [{ type: "text/plain", getAsFile: () => null }] },
    })
    window.dispatchEvent(textPaste)

    await userEvent.click(screen.getByRole("button", { name: /Gallery/i }))
    const galleryBtn = screen
      .getAllByRole("button")
      .find((b) => b.querySelector('img[src="asset:///only-path.png"]'))
    expect(galleryBtn).toBeTruthy()
    await userEvent.click(galleryBtn!)

    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        format: "json",
        fields: { ...emptyStructuredFields(), Subject: "" },
        result: "seed",
        busy: false,
      },
    })
    await waitFor(() => expect(screen.getByText("Subject")).toBeTruthy())
    await userEvent.type(screen.getAllByRole("textbox")[0]!, "z")

    useStudioStore.setState({
      imageToPrompt: {
        ...useStudioStore.getState().imageToPrompt,
        format: "graphicDesign",
        fields: { ...emptyStructuredFields(), Subject: "" },
      },
    })
    await waitFor(() => expect(screen.getByText("Subject")).toBeTruthy())
  })
})
