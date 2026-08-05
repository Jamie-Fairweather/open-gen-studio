import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { DownloadJobView } from "@/lib/host"
import { DownloadQueueList } from "./download-queue-list"

function job(partial: Partial<DownloadJobView>): DownloadJobView {
  return {
    id: "d1",
    jobKey: "blueprint:x",
    title: "Model",
    kind: "blueprint",
    status: "queued",
    error: null,
    createdAt: 0,
    updatedAt: 1,
    steps: [
      {
        id: "s1",
        idx: 0,
        stepKind: "http",
        label: "File",
        status: "queued",
        bytesDone: 0,
        bytesTotal: 100,
        error: null,
      },
    ],
    activeLabel: null,
    downloaded: 0,
    total: 100,
    ...partial,
  }
}

describe("DownloadQueueList", () => {
  it("returns null when empty", () => {
    const { container } = render(
      <DownloadQueueList queued={[]} onResume={() => {}} onCancel={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders queued/paused and fires actions", async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    const onCancel = vi.fn()
    render(
      <ul>
        <DownloadQueueList
          queued={[
            job({ id: "a", title: "A", status: "queued" }),
            job({
              id: "b",
              title: "B",
              status: "paused",
              steps: [
                {
                  id: "s1",
                  idx: 0,
                  stepKind: "http",
                  label: "F",
                  status: "paused",
                  bytesDone: 0,
                  bytesTotal: null,
                  error: null,
                },
                {
                  id: "s2",
                  idx: 1,
                  stepKind: "http",
                  label: "G",
                  status: "queued",
                  bytesDone: 0,
                  bytesTotal: null,
                  error: null,
                },
              ],
            }),
          ]}
          onResume={onResume}
          onCancel={onCancel}
        />
      </ul>
    )
    expect(screen.getByText("1 step")).toBeTruthy()
    expect(screen.getByText(/2 steps · paused/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /Resume/i }))
    expect(onResume).toHaveBeenCalledWith("b")
    await user.click(screen.getAllByRole("button", { name: /Remove/i })[0]!)
    expect(onCancel).toHaveBeenCalledWith("a")
  })
})
