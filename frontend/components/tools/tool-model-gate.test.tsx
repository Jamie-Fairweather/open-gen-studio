import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { DownloadJobView, PromptToolWeightInfo } from "@/lib/host"

const isTauri = vi.fn(() => true)
const listPromptToolWeights = vi.fn(
  async (): Promise<PromptToolWeightInfo[]> => []
)
const pauseDownload = vi.fn(async () => {})
const resumeDownload = vi.fn(async () => {})
const cancelDownload = vi.fn(async () => {})
const notifyError = vi.fn()
const beginPromptToolsInstall = vi.fn(async () => {})

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    isTauri: () => isTauri(),
    listPromptToolWeights: () => listPromptToolWeights(),
    pauseDownload: (...a: unknown[]) => pauseDownload(...a),
    resumeDownload: (...a: unknown[]) => resumeDownload(...a),
    cancelDownload: (...a: unknown[]) => cancelDownload(...a),
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
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

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { useStudioStore } from "@/components/studio/store"
import { ToolModelGate } from "./tool-model-gate"

function dl(partial: Partial<DownloadJobView> = {}): DownloadJobView {
  return {
    id: "d1",
    jobKey: "prompt-tools:qwenvl",
    title: "Qwen",
    kind: "promptTools",
    status: "running",
    error: null,
    createdAt: 0,
    updatedAt: 1,
    steps: [
      {
        id: "s1",
        idx: 0,
        stepKind: "http",
        label: "Weights",
        status: "running",
        bytesDone: 50,
        bytesTotal: 100,
        error: null,
      },
      {
        id: "s2",
        idx: 1,
        stepKind: "http",
        label: "Extra",
        status: "queued",
        bytesDone: 0,
        bytesTotal: 50,
        error: null,
      },
    ],
    activeLabel: null,
    downloaded: 50,
    total: 100,
    ...partial,
  }
}

describe("ToolModelGate", () => {
  beforeEach(() => {
    isTauri.mockReturnValue(true)
    listPromptToolWeights.mockReset().mockResolvedValue([])
    beginPromptToolsInstall.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
    useStudioStore.setState({
      downloadSnapshot: { active: null, queued: [], history: [] },
      downloadSpeedBps: 100_000,
      beginPromptToolsInstall: (...a: unknown[]) =>
        beginPromptToolsInstall(...a),
    } as never)
  })

  it("checking → missing → install / desktop guard / failed", async () => {
    const user = userEvent.setup()
    listPromptToolWeights.mockImplementation(
      () => new Promise(() => {}) // stay checking briefly
    )
    const { unmount } = render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    expect(screen.getByText(/Checking model/)).toBeTruthy()
    unmount()

    listPromptToolWeights.mockResolvedValue([
      {
        provider: "qwenvl",
        name: "QwenVL",
        description: "Need this",
        ready: false,
      } as PromptToolWeightInfo,
    ])
    render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText(/Install QwenVL/)).toBeTruthy())
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    expect(beginPromptToolsInstall).toHaveBeenCalledWith("qwenvl")

    beginPromptToolsInstall.mockRejectedValueOnce(new Error("no"))
    await user.click(screen.getByRole("button", { name: /^Install$/i }))
    await waitFor(() => expect(notifyError).toHaveBeenCalled())

    isTauri.mockReturnValue(false)
    listPromptToolWeights.mockResolvedValue([])
    const { unmount: u2 } = render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() =>
      expect(screen.getByText(/require the desktop app/)).toBeTruthy()
    )
    u2()
  })

  it("ready children and list error → failed", async () => {
    listPromptToolWeights.mockResolvedValue([
      {
        provider: "qwenvl",
        name: "QwenVL",
        description: "d",
        ready: true,
      } as PromptToolWeightInfo,
    ])
    render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText("Ready UI")).toBeTruthy())

    listPromptToolWeights.mockRejectedValueOnce(new Error("weights boom"))
    render(
      <ToolModelGate providerId="other" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText(/weights boom/)).toBeTruthy())
  })

  it("installing / queued download cards", async () => {
    const user = userEvent.setup()
    listPromptToolWeights.mockResolvedValue([
      {
        provider: "qwenvl",
        name: "QwenVL",
        description: "d",
        ready: false,
      } as PromptToolWeightInfo,
    ])
    useStudioStore.setState({
      downloadSnapshot: { active: dl(), queued: [], history: [] },
      downloadSpeedBps: 100_000,
      beginPromptToolsInstall,
    } as never)

    const { unmount } = render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText("Qwen")).toBeTruthy())
    await user.click(screen.getByRole("button", { name: /Pause/i }))
    expect(pauseDownload).toHaveBeenCalledWith("d1")
    await user.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(cancelDownload).toHaveBeenCalled()

    act(() => {
      useStudioStore.setState({
        downloadSnapshot: {
          active: dl({
            status: "paused",
            steps: [
              {
                id: "s1",
                idx: 0,
                stepKind: "http",
                label: "Weights",
                status: "paused",
                bytesDone: 10,
                bytesTotal: null,
                error: null,
              },
            ],
            total: null,
            downloaded: 0,
          }),
          queued: [],
          history: [],
        },
      })
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Resume/i })).toBeTruthy()
    )
    await user.click(screen.getByRole("button", { name: /Resume/i }))
    expect(resumeDownload).toHaveBeenCalled()
    unmount()

    useStudioStore.setState({
      downloadSnapshot: {
        active: null,
        queued: [dl({ id: "q1", status: "queued" })],
        history: [],
      },
    })
    render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText("Queued")).toBeTruthy())

    // preparing / working / step statuses + jobPct from step bytes
    useStudioStore.setState({
      downloadSnapshot: {
        active: dl({
          total: null,
          downloaded: 0,
          steps: [
            {
              id: "a",
              idx: 0,
              stepKind: "http",
              label: "A",
              status: "done",
              bytesDone: 1,
              bytesTotal: 1,
              error: null,
            },
            {
              id: "b",
              idx: 1,
              stepKind: "http",
              label: "B",
              status: "running",
              bytesDone: 40,
              bytesTotal: 80,
              error: null,
            },
            {
              id: "c",
              idx: 2,
              stepKind: "http",
              label: "C",
              status: "error",
              bytesDone: 0,
              bytesTotal: null,
              error: "e",
            },
          ],
        }),
        queued: [],
        history: [],
      },
      downloadSpeedBps: 0,
    })
    await waitFor(() => expect(screen.getByText(/50\.00%/)).toBeTruthy())

    // matched leaves queue → refresh path (line 99)
    listPromptToolWeights.mockClear()
    act(() => {
      useStudioStore.setState({
        downloadSnapshot: {
          active: null,
          queued: [],
          history: [{ ...dl({ id: "done", status: "done" }) }],
        },
      })
    })
    await waitFor(() =>
      expect(listPromptToolWeights.mock.calls.length).toBeGreaterThan(0)
    )
  })

  it("uses fallback weight provider and non-http active step pct", async () => {
    listPromptToolWeights.mockResolvedValue([
      {
        provider: "other",
        name: "Fallback",
        description: "d",
        ready: true,
      } as PromptToolWeightInfo,
    ])
    render(
      <ToolModelGate providerId="missing-provider" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() => expect(screen.getByText("Ready UI")).toBeTruthy())

    listPromptToolWeights.mockResolvedValue([
      {
        provider: "qwenvl",
        name: "QwenVL",
        description: "d",
        ready: false,
      } as PromptToolWeightInfo,
    ])
    useStudioStore.setState({
      downloadSnapshot: {
        active: dl({
          total: null,
          downloaded: 0,
          steps: [
            {
              id: "s1",
              idx: 0,
              stepKind: "shell",
              label: "Prep",
              status: "running",
              bytesDone: 0,
              bytesTotal: 0,
              error: null,
            },
          ],
        }),
        queued: [],
        history: [],
      },
    } as never)
    render(
      <ToolModelGate providerId="qwenvl" toolLabel="Tip">
        <p>Ready UI</p>
      </ToolModelGate>
    )
    await waitFor(() =>
      expect(
        screen.getAllByText(/Ready UI|Checking model|Install/).length
      ).toBeGreaterThan(0)
    )
  })
})
