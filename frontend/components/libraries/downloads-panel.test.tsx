import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { DownloadJobView, DownloadSnapshot } from "@/lib/host"
import { DownloadsPanel } from "./downloads-panel"

function job(partial: Partial<DownloadJobView> = {}): DownloadJobView {
  return {
    id: "j1",
    jobKey: "blueprint:x",
    title: "BP",
    kind: "blueprint",
    status: "running",
    error: null,
    createdAt: 0,
    updatedAt: 1,
    steps: [
      {
        id: "s",
        idx: 0,
        stepKind: "http",
        label: "File",
        status: "running",
        bytesDone: 1,
        bytesTotal: 10,
        error: null,
      },
    ],
    activeLabel: null,
    downloaded: 1,
    total: 10,
    ...partial,
  }
}

describe("DownloadsPanel", () => {
  it("empty state has no blueprint CTA", () => {
    render(
      <DownloadsPanel
        snapshot={{ active: null, queued: [], history: [] }}
        onPause={() => {}}
        onResume={() => {}}
        onCancel={() => {}}
        banner={<p>Notice</p>}
      />
    )
    expect(screen.getByText("Nothing in the queue")).toBeTruthy()
    expect(screen.getByText("Idle")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Blueprints/i })).toBeNull()
    expect(
      screen.queryByRole("button", { name: /Choose a blueprint/i })
    ).toBeNull()
  })

  it("status lines for active/queued/history combinations", () => {
    const snap = (s: Partial<DownloadSnapshot>): DownloadSnapshot => ({
      active: null,
      queued: [],
      history: [],
      ...s,
    })
    const handlers = {
      onPause: vi.fn(),
      onResume: vi.fn(),
      onCancel: vi.fn(),
    }

    const { rerender } = render(
      <DownloadsPanel snapshot={snap({ active: job() })} {...handlers} />
    )
    expect(screen.getByText("Transferring")).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({
          active: job({
            status: "paused",
            steps: [{ ...job().steps[0]!, status: "paused" }],
          }),
          queued: [job({ id: "q1", status: "queued" })],
        })}
        {...handlers}
      />
    )
    expect(screen.getByText(/Paused · 1 waiting/)).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({
          active: job({
            steps: [
              {
                id: "e",
                idx: 0,
                stepKind: "extract",
                label: "Extract",
                status: "running",
                bytesDone: 0,
                bytesTotal: null,
                error: null,
              },
            ],
            total: null,
          }),
          queued: [job({ id: "q1" })],
        })}
        activeDetail="Unpacking"
        {...handlers}
      />
    )
    expect(screen.getByText(/Unpacking · 1 waiting/)).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({ queued: [job({ id: "q1", status: "queued" })] })}
        {...handlers}
      />
    )
    expect(screen.getByText("1 waiting")).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({ history: [job({ id: "h1", status: "done" })] })}
        {...handlers}
      />
    )
    expect(screen.getByText("1 recent")).toBeTruthy()

    rerender(
      <DownloadsPanel snapshot={snap({ active: job() })} {...handlers} />
    )
    rerender(
      <DownloadsPanel
        snapshot={snap({
          active: job({
            status: "running",
            steps: [
              {
                id: "s",
                idx: 0,
                stepKind: "http",
                label: "File",
                status: "running",
                bytesDone: 1,
                bytesTotal: 10,
                error: null,
              },
            ],
          }),
        })}
        {...handlers}
      />
    )
    expect(screen.getByText("Transferring")).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({
          active: job({
            status: "paused",
            steps: [
              {
                id: "s",
                idx: 0,
                stepKind: "http",
                label: "File",
                status: "paused",
                bytesDone: 1,
                bytesTotal: 10,
                error: null,
              },
            ],
          }),
        })}
        {...handlers}
      />
    )
    expect(screen.getByText("Paused")).toBeTruthy()

    rerender(
      <DownloadsPanel
        snapshot={snap({
          active: job({
            steps: [
              {
                id: "e",
                idx: 0,
                stepKind: "extract",
                label: "Extract",
                status: "running",
                bytesDone: 0,
                bytesTotal: null,
                error: null,
              },
            ],
            total: null,
          }),
        })}
        {...handlers}
      />
    )
    expect(screen.getAllByText(/Extract…/).length).toBeGreaterThan(0)
  })
})
