import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { JobHistoryItem } from "@/lib/host"

const clipboard = { writeText: vi.fn(() => Promise.resolve()) }
const notifySuccess = vi.fn()
const notifyError = vi.fn()
const parseGalleryRecipe = vi.fn(() => null as null | { values: object })

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock({
    gallerySrc: (p: string) => `asset://${p}`,
    parseGalleryRecipe: (...a: unknown[]) => parseGalleryRecipe(...a),
  })
})

vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
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

import { useStudioStore } from "@/components/studio/store"
import { HistoryDetail, HistoryRow } from "./history-ui"
import { parseHistoryItem } from "./history-parse"

async function waitForNotify() {
  await vi.waitFor(() => {
    expect(notifyError).toHaveBeenCalledWith("Could not copy")
  })
}

function hist(partial: Partial<JobHistoryItem> = {}): JobHistoryItem {
  return {
    jobId: "hist-row-1",
    kind: "generate",
    label: "Shot",
    status: "completed",
    error: null,
    paramsJson: JSON.stringify({ prompt: "p" }),
    createdAt: 0,
    updatedAt: 10,
    galleryItems: [],
    ...partial,
  }
}

describe("HistoryRow", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    })
    clipboard.writeText.mockReset().mockResolvedValue(undefined)
  })

  it("selects via click/keyboard and deletes", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    const thumb = {
      id: "thumb-row",
      jobId: "hist-row-1",
      path: "/a.png",
      thumbnailPath: "/t.png",
      metadataJson: JSON.stringify({
        prompt: "hi",
        values: { width: 1, height: 1, seed: 2 },
      }),
      createdAt: 0,
    }
    render(
      <HistoryRow
        item={hist({ galleryItems: [thumb], status: "failed" })}
        selected
        onSelect={onSelect}
        onDelete={onDelete}
      />
    )
    await user.click(screen.getByRole("button", { name: /Shot/i }))
    expect(onSelect).toHaveBeenCalled()
    screen.getByRole("button", { name: /Shot/i }).focus()
    await user.keyboard("{Enter}")
    await user.keyboard(" ")
    fireEvent.keyDown(screen.getByRole("button", { name: /Shot/i }), {
      key: "Tab",
    })
    expect(onSelect.mock.calls.length).toBeGreaterThanOrEqual(3)
    await user.click(screen.getByLabelText("Remove from history"))
    expect(onDelete).toHaveBeenCalledWith(false)
  })

  it("renders glyph when no thumb", () => {
    render(
      <HistoryRow
        item={hist({ kind: "prompt-tool", jobId: "no-thumb", updatedAt: 11 })}
        selected={false}
        onSelect={() => {}}
        onDelete={() => {}}
      />
    )
    expect(screen.getByText("Shot")).toBeTruthy()
  })
})

describe("HistoryDetail", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    })
    clipboard.writeText.mockReset().mockResolvedValue(undefined)
    notifySuccess.mockReset()
    notifyError.mockReset()
    parseGalleryRecipe.mockReset().mockReturnValue(null)
    useStudioStore.setState({
      handleReuseGallerySettings: vi.fn(),
      setQueueExpandOpen: vi.fn(),
    } as never)
  })

  it("covers generate prompt copy / reuse / enhance branches", async () => {
    const reuse = vi.fn()
    const setOpen = vi.fn()
    useStudioStore.setState({
      handleReuseGallerySettings: reuse,
      setQueueExpandOpen: setOpen,
    } as never)

    const thumb = {
      id: "thumb-detail",
      jobId: "hist-detail-1",
      path: "/a.png",
      thumbnailPath: null,
      metadataJson: JSON.stringify({
        prompt: "hello prompt",
        values: { width: 512, height: 512, seed: 9 },
      }),
      createdAt: 0,
    }
    parseGalleryRecipe.mockReturnValue({ values: { seed: 9 } })

    const { rerender } = render(
      <HistoryDetail
        item={hist({
          jobId: "hist-detail-1",
          updatedAt: 99,
          galleryItems: [thumb],
          error: "boom",
          status: "failed",
        })}
      />
    )
    expect(screen.getByText("boom")).toBeTruthy()
    expect(screen.getByText(/512/)).toBeTruthy()
    expect(screen.getByText(/seed/)).toBeTruthy()
    // Force clipboard API used by copyText()
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard,
    })
    fireEvent.click(screen.getByRole("button", { name: /Copy prompt/i }))
    await vi.waitFor(() => {
      expect(notifySuccess).toHaveBeenCalledWith("Copied")
    })
    fireEvent.click(screen.getByRole("button", { name: /Reuse all settings/i }))
    expect(reuse).toHaveBeenCalled()
    expect(setOpen).toHaveBeenCalledWith(false)

    clipboard.writeText.mockRejectedValueOnce(undefined)
    fireEvent.click(screen.getByRole("button", { name: /Copy prompt/i }))
    await waitForNotify()

    rerender(
      <HistoryDetail
        item={hist({
          jobId: "enhance-1",
          updatedAt: 100,
          kind: "prompt-tool",
          paramsJson: JSON.stringify({
            prompt: "in",
            mode: "expand",
            format: "general",
            result: { prompt: "out", format: "enhance" },
          }),
          galleryItems: [],
        })}
      />
    )
    expect(screen.getByText("Input")).toBeTruthy()
    expect(screen.getByText("Output")).toBeTruthy()

    rerender(
      <HistoryDetail
        item={hist({
          jobId: "enhance-2",
          updatedAt: 101,
          kind: "prompt-tool",
          paramsJson: JSON.stringify({
            prompt: "in",
            mode: "expand",
            format: "general",
            result: { prompt: "", format: "enhance" },
          }),
        })}
      />
    )
    expect(screen.getByText(/No enhanced prompt stored/)).toBeTruthy()

    rerender(
      <HistoryDetail
        item={hist({
          jobId: "i2p-1",
          updatedAt: 102,
          paramsJson: JSON.stringify({
            imagePath: "/in.png",
            format: "json",
            result: { prompt: "from img" },
          }),
          kind: "prompt-tool",
          galleryItems: [],
        })}
      />
    )
    expect(screen.getByText("Prompt")).toBeTruthy()
    fireEvent.click(screen.getByLabelText("Copy prompt"))

    rerender(
      <HistoryDetail
        item={hist({ jobId: "empty-1", updatedAt: 103, paramsJson: "{}" })}
      />
    )
    expect(screen.getByText(/No prompt stored/)).toBeTruthy()

    parseGalleryRecipe.mockReturnValueOnce({
      prompt: "",
      values: { width: 1, height: 1 },
    })
    rerender(
      <HistoryDetail
        item={hist({
          jobId: "reuse-only",
          updatedAt: 104,
          galleryItems: [
            {
              id: "t-reuse",
              jobId: "reuse-only",
              path: "/a.png",
              thumbnailPath: null,
              metadataJson: JSON.stringify({ values: { width: 1, height: 1 } }),
              createdAt: 0,
            },
          ],
        })}
      />
    )
    expect(screen.queryByRole("button", { name: /Copy prompt/i })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Reuse all settings/i }))

    rerender(
      <HistoryDetail
        item={hist({
          jobId: "enhance-in",
          updatedAt: 105,
          kind: "prompt-tool",
          paramsJson: JSON.stringify({
            prompt: "idea",
            mode: "expand",
            format: "general",
            result: { prompt: "out", format: "enhance" },
          }),
        })}
      />
    )
    expect(screen.getByText("Input")).toBeInTheDocument()

    rerender(
      <HistoryDetail
        item={hist({
          jobId: "enhance-blank",
          updatedAt: 106,
          kind: "prompt-tool",
          paramsJson: JSON.stringify({
            prompt: "   ",
            mode: "expand",
            result: { prompt: "out", format: "enhance" },
          }),
        })}
      />
    )
    expect(screen.queryByText("Input")).toBeNull()
    parseGalleryRecipe.mockReturnValue(null)
    rerender(
      <HistoryDetail
        item={hist({
          jobId: "settings-off",
          updatedAt: 107,
          galleryItems: [
            {
              id: "t-off",
              jobId: "settings-off",
              path: "/a.png",
              thumbnailPath: null,
              metadataJson: "{}",
              createdAt: 0,
            },
          ],
        })}
      />
    )
    expect(
      screen.queryByRole("button", { name: /Reuse all settings/i })
    ).toBeNull()

    parseGalleryRecipe.mockReturnValue(null)
    rerender(
      <HistoryDetail
        item={hist({
          jobId: "copy-only",
          updatedAt: 108,
          galleryItems: [
            {
              id: "t-copy",
              jobId: "copy-only",
              path: "/a.png",
              thumbnailPath: null,
              metadataJson: JSON.stringify({ prompt: "only copy" }),
              createdAt: 0,
            },
          ],
        })}
      />
    )
    expect(screen.getByRole("button", { name: /Copy prompt/i })).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: /Reuse all settings/i })
    ).toBeNull()
  })

  it("clears history parse cache after many entries", () => {
    for (let i = 0; i < 2501; i++) {
      parseHistoryItem(
        hist({
          jobId: `cache-${i}`,
          updatedAt: i,
          galleryItems: [],
        })
      )
    }
    expect(
      parseHistoryItem(hist({ jobId: "after-cache", updatedAt: 9999 })).prompt
    ).toBeNull()
  })
})
