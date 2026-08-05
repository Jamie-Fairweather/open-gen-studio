import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { DownloadJobView, DownloadStepView } from "@/lib/host"
import { DownloadActiveJob } from "./download-active-job"

function step(partial: Partial<DownloadStepView>): DownloadStepView {
  return {
    id: "s1",
    idx: 0,
    stepKind: "http",
    label: "Weights",
    status: "running",
    bytesDone: 50,
    bytesTotal: 100,
    error: null,
    ...partial,
  }
}

function job(partial: Partial<DownloadJobView> = {}): DownloadJobView {
  return {
    id: "job1",
    jobKey: "blueprint:x",
    title: "Flux",
    kind: "blueprint",
    status: "running",
    error: null,
    createdAt: 0,
    updatedAt: 1,
    steps: [step({})],
    activeLabel: null,
    downloaded: 50,
    total: 100,
    ...partial,
  }
}

describe("DownloadActiveJob", () => {
  it("transfer running with ETA, pause/cancel, multi-step", async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <DownloadActiveJob
        active={job()}
        pendingCount={3}
        speedBps={100_000}
        activeDetail={null}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText(/3 jobs in queue/)).toBeTruthy()
    expect(screen.getByText(/ETA/)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /Pause/i }))
    expect(onPause).toHaveBeenCalledWith("job1")

    rerender(
      <DownloadActiveJob
        active={job({ status: "paused", steps: [step({ status: "paused" })] })}
        pendingCount={1}
        speedBps={0}
        activeDetail={null}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    await user.click(screen.getByRole("button", { name: /Resume/i }))
    expect(onResume).toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()

    // Preparing when transfer with no totals/bytes
    rerender(
      <DownloadActiveJob
        active={job({
          total: null,
          downloaded: 0,
          steps: [step({ bytesDone: 0, bytesTotal: null })],
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail={null}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText(/Preparing/)).toBeTruthy()

    // bytesDone > 0 without total
    rerender(
      <DownloadActiveJob
        active={job({
          total: null,
          downloaded: 0,
          steps: [step({ bytesDone: 25, bytesTotal: null })],
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail={null}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )

    // non-http step with detail pct
    rerender(
      <DownloadActiveJob
        active={job({
          total: null,
          steps: [
            step({
              id: "a",
              status: "done",
              stepKind: "http",
              bytesDone: 100,
              bytesTotal: 100,
            }),
            step({
              id: "b",
              status: "running",
              stepKind: "extract",
              label: "Extract",
              bytesDone: 0,
              bytesTotal: null,
            }),
          ],
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail="Extracting… 40%"
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getAllByText(/Extract/).length).toBeGreaterThan(0)

    // non-http without pct → workLabel
    rerender(
      <DownloadActiveJob
        active={job({
          total: null,
          steps: [
            step({
              status: "running",
              stepKind: "extract",
              label: "Unpack",
              bytesDone: 0,
              bytesTotal: null,
            }),
          ],
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail="working hard"
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText("working hard")).toBeTruthy()

    // no active step
    rerender(
      <DownloadActiveJob
        active={job({
          steps: [step({ status: "queued", stepKind: "extract" })],
          total: null,
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail={null}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText("Working…")).toBeTruthy()

    rerender(
      <DownloadActiveJob
        active={job({
          steps: [
            step({
              id: "done",
              status: "done",
              bytesDone: 100,
              bytesTotal: 100,
            }),
            step({
              id: "queued",
              status: "queued",
              label: "Wait",
              bytesDone: 0,
              bytesTotal: 50,
            }),
            step({
              id: "fail",
              status: "failed",
              label: "Fail",
              bytesDone: 0,
              bytesTotal: 0,
            }),
          ],
        })}
        pendingCount={1}
        speedBps={0}
        activeDetail="Step 50%"
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
      />
    )
    expect(screen.getByText(/50 B/)).toBeTruthy()
    expect(screen.getAllByText(/Wait/).length).toBeGreaterThan(0)
  })
})
