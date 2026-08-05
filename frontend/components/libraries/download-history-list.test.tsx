import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import type { DownloadJobView } from "@/lib/host"
import { DownloadHistoryList } from "./download-history-list"

function job(partial: Partial<DownloadJobView>): DownloadJobView {
  return {
    id: "d1",
    jobKey: "k",
    title: "T",
    kind: "blueprint",
    status: "done",
    error: null,
    createdAt: 0,
    updatedAt: 1,
    steps: [],
    activeLabel: null,
    downloaded: 0,
    total: null,
    ...partial,
  }
}

describe("DownloadHistoryList", () => {
  it("returns null when empty", () => {
    const { container } = render(<DownloadHistoryList history={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders status tones and error text", () => {
    render(
      <ul>
        <DownloadHistoryList
          history={[
            job({ id: "1", title: "Ok", status: "done" }),
            job({ id: "2", title: "Bad", status: "error", error: "fail" }),
            job({ id: "3", title: "Stop", status: "cancelled" }),
            job({ id: "4", title: "Hold", status: "paused" }),
          ]}
        />
      </ul>
    )
    expect(screen.getByText("fail")).toBeTruthy()
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Cancelled").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Paused").length).toBeGreaterThan(0)
  })
})
