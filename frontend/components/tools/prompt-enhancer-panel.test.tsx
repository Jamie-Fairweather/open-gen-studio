import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

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
    isTauri: () => true,
    listPromptToolWeights: vi.fn(async () => [
      {
        id: "enhancer",
        provider: "enhancer",
        name: "Enhancer",
        description: "d",
        ready: true,
      },
    ]),
  })
})

vi.mock("@/lib/notify", () => ({
  notifySuccess: vi.fn(),
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
import { PromptEnhancerPanel } from "./prompt-enhancer-panel"

describe("PromptEnhancerPanel", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    })
    useStudioStore.setState({
      prompt: "studio seed",
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        input: "",
        result: "",
        negative: null,
        target: "auto",
        mode: "expand",
        styleLook: "cinematic",
        busy: false,
        status: null,
        error: null,
        jobId: null,
        seeded: false,
      },
      downloadSnapshot: { active: null, queued: [], history: [] },
      detail: null,
      selectedId: null,
      blueprints: [],
    })
    useStudioStore.getState().setToolsHandoff(null)
  })

  it("seeds from studio prompt and shows style look + result", async () => {
    const user = userEvent.setup()
    render(<PromptEnhancerPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().promptEnhance.seeded).toBe(true)
    )
    expect(useStudioStore.getState().promptEnhance.input).toBe("studio seed")

    fireEvent.change(screen.getByPlaceholderText(/short subject/i), {
      target: { value: "typed idea" },
    })
    expect(useStudioStore.getState().promptEnhance.input).toBe("typed idea")

    await user.click(screen.getByRole("radio", { name: /Style/i }))
    expect(screen.getByText("Look")).toBeTruthy()
    await user.click(screen.getByRole("radio", { name: /Anime/i }))
    expect(useStudioStore.getState().promptEnhance.styleLook).toBe("anime")
    await user.click(screen.getByRole("radio", { name: /Flux/i }))

    const run = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    useStudioStore.setState({
      runPromptEnhanceTool: run,
      cancelPromptEnhanceTool: cancel,
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        busy: true,
        jobId: "pe1",
        status: "Working",
        result: "",
      },
    } as never)
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeTruthy()
    )
    await user.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(cancel).toHaveBeenCalled()

    useStudioStore.setState({
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        busy: false,
        result: "enhanced text",
      },
    })
    await waitFor(() =>
      expect(screen.getByDisplayValue("enhanced text")).toBeTruthy()
    )
    fireEvent.change(screen.getByDisplayValue("enhanced text"), {
      target: { value: "tweaked" },
    })
    expect(useStudioStore.getState().promptEnhance.result).toBe("tweaked")
    await user.click(screen.getByRole("button", { name: /^Enhance$/i }))
    expect(run).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Use in Studio/i }))
  })

  it("seeds handoff prompt, keeps existing input, and uses input in studio", async () => {
    useStudioStore.getState().setToolsHandoff({ prompt: "  handoff prompt  " })
    useStudioStore.setState({
      prompt: "",
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        input: "",
        seeded: false,
        target: "flux",
      },
    })
    render(<PromptEnhancerPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().promptEnhance.input).toBe(
        "handoff prompt"
      )
    )

    useStudioStore.getState().setToolsHandoff(null)
    useStudioStore.setState({
      prompt: "",
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        input: "kept input",
        seeded: false,
      },
      detail: null,
      selectedId: null,
      blueprints: [],
    })
    render(<PromptEnhancerPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().promptEnhance.input).toBe("kept input")
    )

    useStudioStore.setState({
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        result: "",
        input: "fallback only",
      },
    })
    const user = userEvent.setup()
    await user.click(
      screen.getAllByRole("button", { name: /Use in Studio/i })[0]!
    )
  })

  it("seeded path consumes handoff; busy path marks seeded", async () => {
    useStudioStore.getState().setToolsHandoff({ prompt: "from handoff" })
    useStudioStore.setState({
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        seeded: true,
        input: "already",
      },
    })
    const { unmount } = render(<PromptEnhancerPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().toolsHandoff).toBeNull()
    )
    unmount()

    useStudioStore.setState({
      promptEnhance: {
        ...useStudioStore.getState().promptEnhance,
        seeded: false,
        busy: true,
        input: "busy",
      },
    })
    render(<PromptEnhancerPanel />)
    await waitFor(() =>
      expect(useStudioStore.getState().promptEnhance.seeded).toBe(true)
    )
  })
})
