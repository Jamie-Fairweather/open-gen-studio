import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { JobHistoryItem, JobQueueItem } from "@/lib/host"

const listJobHistory = vi.fn(async (): Promise<JobHistoryItem[]> => [])
const deleteJobHistoryItem = vi.fn(async () => {})
const clearJobHistory = vi.fn(async () => {})
const onJobHistory = vi.fn(async () => () => {})
const notifyError = vi.fn()
const notifySuccess = vi.fn()
let historyHandler: (() => void) | null = null

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    listJobHistory: (...a: unknown[]) => listJobHistory(...a),
    deleteJobHistoryItem: (...a: unknown[]) => deleteJobHistoryItem(...a),
    clearJobHistory: (...a: unknown[]) => clearJobHistory(...a),
    onJobHistory: (h: () => void) => {
      historyHandler = h
      return onJobHistory(h)
    },
    clearJobQueue: vi.fn(async () => {}),
    gallerySrc: (p: string) => `asset://${p}`,
    parseGalleryRecipe: () => null,
  })
})

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
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

vi.mock("@dnd-kit/sortable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/sortable")>()
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

import { useStudioStore } from "@/components/studio/store"
import { JobQueueExpandDialog } from "./job-queue-expand-dialog"

const q = (partial: Partial<JobQueueItem>): JobQueueItem => ({
  jobId: "j1",
  kind: "generate",
  label: "Gen",
  status: "queued",
  prompt: null,
  meta: null,
  ...partial,
})

function hist(partial: Partial<JobHistoryItem> = {}): JobHistoryItem {
  return {
    jobId: "h1",
    kind: "generate",
    label: "Done",
    status: "completed",
    error: null,
    paramsJson: JSON.stringify({ prompt: "p" }),
    createdAt: 0,
    updatedAt: 1,
    galleryItems: [],
    ...partial,
  }
}

async function openDialog() {
  render(<JobQueueExpandDialog />)
  await act(async () => {
    useStudioStore.setState({ queueExpandOpen: true })
  })
}

describe("JobQueueExpandDialog", () => {
  beforeEach(() => {
    listJobHistory.mockReset().mockResolvedValue([])
    deleteJobHistoryItem.mockReset().mockResolvedValue(undefined)
    clearJobHistory.mockReset().mockResolvedValue(undefined)
    notifyError.mockReset()
    notifySuccess.mockReset()
    historyHandler = null
    useStudioStore.setState({
      queueExpandOpen: false,
      jobQueue: [],
      genStep: null,
    })
  })

  it("opens on history when queue empty and loads history", async () => {
    const user = userEvent.setup()
    listJobHistory.mockResolvedValue([
      hist({ jobId: "h1", status: "failed" }),
      hist({ jobId: "h2", status: "cancelled", label: "Cancel" }),
      hist({ jobId: "h3", status: "completed", label: "Ok" }),
    ])
    await openDialog()
    await waitFor(() => expect(listJobHistory).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getAllByText("Done").length).toBeGreaterThan(0)
    )

    await user.click(screen.getByRole("tab", { name: /Active/i }))
    expect(screen.getByText("Queue empty.")).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: /History/i }))

    historyHandler?.()
    await waitFor(() =>
      expect(listJobHistory.mock.calls.length).toBeGreaterThan(1)
    )
  })

  it("active tab with jobs and clear", async () => {
    const user = userEvent.setup()
    useStudioStore.setState({
      jobQueue: [q({ jobId: "a", status: "running" }), q({ jobId: "b" })],
      genStep: { jobId: "a", step: 1, max: 5 },
    })
    await openDialog()
    await waitFor(() => expect(screen.getByText("Clear")).toBeTruthy())
    expect(screen.getAllByText("Gen").length).toBeGreaterThan(0)
    await user.click(screen.getByText("Clear"))
  })

  it("deletes history with/without confirm and purges", async () => {
    const user = userEvent.setup()
    const withGallery = hist({
      jobId: "g1",
      label: "WithImg",
      updatedAt: 2,
      galleryItems: [
        {
          id: "img",
          jobId: "g1",
          path: "/a.png",
          thumbnailPath: null,
          metadataJson: "{}",
          createdAt: 0,
        },
      ],
    })
    const failed = hist({
      jobId: "f1",
      status: "failed",
      label: "Fail",
      updatedAt: 3,
    })
    listJobHistory.mockResolvedValue([withGallery, failed])
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("WithImg").length).toBeGreaterThan(0)
    )

    await user.click(screen.getAllByText("Fail")[0]!)
    const removeBtns = screen.getAllByLabelText("Remove from history")
    await user.click(removeBtns[1]!)
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("f1", false)
    )
    expect(notifySuccess).toHaveBeenCalledWith("Removed from history")

    await user.click(removeBtns[0]!)
    expect(screen.getByText("Delete history item?")).toBeTruthy()
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("g1", true)
    )
  })

  it("purge cancelled & failed and error paths", async () => {
    const user = userEvent.setup()
    listJobHistory.mockResolvedValue([
      hist({ jobId: "f1", status: "failed", label: "Fail", updatedAt: 4 }),
      hist({ jobId: "c1", status: "completed", label: "Ok", updatedAt: 5 }),
    ])
    await openDialog()
    await waitFor(() =>
      expect(screen.getByText(/Purge cancelled/)).toBeTruthy()
    )

    clearJobHistory.mockRejectedValueOnce(new Error("purge fail"))
    await user.click(screen.getByText(/Purge cancelled/))
    expect(screen.getByText("Purge cancelled & failed?")).toBeTruthy()
    const confirm = screen.getByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: /Delete/i }))
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("purge fail"))

    clearJobHistory.mockResolvedValueOnce(undefined)
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(clearJobHistory).toHaveBeenCalledWith(true))
    expect(notifySuccess).toHaveBeenCalledWith("Purged cancelled & failed")
  })

  it("clears pending history timer on close and keeps selected after purge", async () => {
    const user = userEvent.setup()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    listJobHistory.mockResolvedValue([
      hist({ jobId: "ok1", status: "completed", label: "Keep", updatedAt: 20 }),
      hist({ jobId: "bad1", status: "failed", label: "Drop", updatedAt: 21 }),
    ])
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("Keep").length).toBeGreaterThan(0)
    )
    // Select completed, then schedule refresh via history event, then close.
    await user.click(screen.getAllByText("Keep")[0]!)
    historyHandler?.()
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      vi.runOnlyPendingTimers()
    })
    vi.useRealTimers()

    listJobHistory.mockResolvedValue([
      hist({ jobId: "ok1", status: "completed", label: "Keep", updatedAt: 20 }),
      hist({ jobId: "bad1", status: "failed", label: "Drop", updatedAt: 21 }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Keep").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByText("Keep")[0]!)
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(clearJobHistory).toHaveBeenCalledWith(true))
  })

  it("deleteHistory error and empty history message", async () => {
    const user = userEvent.setup()
    listJobHistory.mockResolvedValue([
      hist({ jobId: "x1", label: "Solo", updatedAt: 6 }),
    ])
    deleteJobHistoryItem.mockRejectedValueOnce(new Error("del"))
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("Solo").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByLabelText("Remove from history")[0]!)
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("del"))

    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    listJobHistory.mockResolvedValue([])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getByText("No finished jobs yet.")).toBeTruthy()
    )

    listJobHistory.mockRejectedValueOnce(new Error("list fail"))
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() => expect(listJobHistory).toHaveBeenCalled())
  })

  it("scheduled refresh and delete without gallery", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    listJobHistory.mockResolvedValue([
      hist({ jobId: "solo", label: "Solo", updatedAt: 7 }),
    ])
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("Solo").length).toBeGreaterThan(0)
    )
    historyHandler?.()
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(listJobHistory.mock.calls.length).toBeGreaterThan(1)

    deleteJobHistoryItem.mockRejectedValueOnce("bad")
    listJobHistory.mockResolvedValue([
      hist({
        jobId: "plain",
        label: "Plain",
        updatedAt: 8,
        galleryItems: [],
      }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Plain").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByLabelText("Remove from history")[0]!)
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("bad"))

    deleteJobHistoryItem.mockRejectedValueOnce(new Error("alert fail"))
    listJobHistory.mockResolvedValue([
      hist({
        jobId: "g2",
        label: "Gallery",
        updatedAt: 9,
        galleryItems: [
          {
            id: "img2",
            jobId: "g2",
            path: "/b.png",
            thumbnailPath: null,
            metadataJson: "{}",
            createdAt: 0,
          },
        ],
      }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Gallery").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByLabelText("Remove from history")[0]!)
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("alert fail"))

    vi.useRealTimers()
  })

  it("covers queue refresh debounce and non-selected delete", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    listJobHistory.mockResolvedValue([
      hist({ jobId: "keep", label: "Keep", updatedAt: 10 }),
      hist({ jobId: "drop", label: "Drop", updatedAt: 11, galleryItems: [] }),
    ])
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("Keep").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByText("Keep")[0]!)
    historyHandler?.()
    historyHandler?.()
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(listJobHistory.mock.calls.length).toBeGreaterThan(1)

    await user.click(screen.getAllByText("Drop")[0]!)
    const removes = screen.getAllByLabelText("Remove from history")
    await user.click(removes[removes.length - 1]!)
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("drop", false)
    )

    clearJobHistory.mockRejectedValueOnce("purge bad")
    listJobHistory.mockResolvedValue([
      hist({ jobId: "keep", label: "Keep", updatedAt: 10 }),
      hist({ jobId: "bad", status: "failed", label: "Bad", updatedAt: 12 }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Bad").length).toBeGreaterThan(0)
    )
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Cancel/i,
      })
    )
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith("purge bad"))

    vi.useRealTimers()
  })

  it("confirm delete cancel, non-selected gallery delete, and solo purge selection", async () => {
    const user = userEvent.setup()
    const galleryThumb = [
      {
        id: "img",
        jobId: "g-other",
        path: "/a.png",
        thumbnailPath: null,
        metadataJson: "{}",
        createdAt: 0,
      },
    ]
    listJobHistory.mockResolvedValue([
      hist({
        jobId: "plain-a",
        label: "PlainA",
        updatedAt: 11,
        galleryItems: [],
      }),
      hist({
        jobId: "plain-b",
        label: "PlainB",
        updatedAt: 12,
        galleryItems: [],
      }),
    ])
    await openDialog()
    await waitFor(() =>
      expect(screen.getAllByText("PlainA").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByText("PlainA")[0]!)
    const plainRemoves = screen.getAllByLabelText("Remove from history")
    await user.click(plainRemoves[plainRemoves.length - 1]!, { shiftKey: true })
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("plain-b", false)
    )

    listJobHistory.mockResolvedValue([
      hist({
        jobId: "g-sel",
        label: "Selected",
        updatedAt: 12,
        galleryItems: galleryThumb,
      }),
      hist({
        jobId: "g-other",
        label: "Other",
        updatedAt: 13,
        galleryItems: galleryThumb.map((g) => ({ ...g, jobId: "g-other" })),
      }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Selected").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByText("Selected")[0]!)
    const removes = screen.getAllByLabelText("Remove from history")
    await user.click(removes[removes.length - 1]!)
    expect(screen.getByText("Delete history item?")).toBeTruthy()
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Cancel/i,
      })
    )
    await waitFor(() =>
      expect(screen.queryByText("Delete history item?")).toBeNull()
    )

    await user.click(removes[removes.length - 1]!)
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("g-other", true)
    )

    listJobHistory.mockResolvedValue([
      hist({ jobId: "bad", status: "failed", label: "Bad", updatedAt: 14 }),
      hist({ jobId: "ok", status: "completed", label: "Ok", updatedAt: 15 }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Bad").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByText("Bad")[0]!)
    clearJobHistory.mockResolvedValueOnce(undefined)
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(clearJobHistory).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(screen.getAllByText("Ok").length).toBeGreaterThan(0)
    )

    listJobHistory.mockResolvedValue([
      hist({ jobId: "solo", label: "Solo", updatedAt: 16, galleryItems: [] }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("Solo").length).toBeGreaterThan(0)
    )
    await user.click(screen.getAllByLabelText("Remove from history")[0]!)
    await waitFor(() =>
      expect(deleteJobHistoryItem).toHaveBeenCalledWith("solo", false)
    )

    listJobHistory.mockResolvedValue([
      hist({
        jobId: "only-fail",
        status: "failed",
        label: "OnlyFail",
        updatedAt: 17,
      }),
    ])
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: false })
    })
    await act(async () => {
      useStudioStore.setState({ queueExpandOpen: true })
    })
    await waitFor(() =>
      expect(screen.getAllByText("OnlyFail").length).toBeGreaterThan(0)
    )
    clearJobHistory.mockResolvedValueOnce(undefined)
    await user.click(screen.getByText(/Purge cancelled/))
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /Delete/i,
      })
    )
    await waitFor(() => expect(clearJobHistory).toHaveBeenCalledWith(true))
  })
})
