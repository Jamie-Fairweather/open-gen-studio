import { describe, expect, it, vi } from "vitest"
import type { DownloadJobView, DownloadStepView } from "@/lib/host"
import {
  detailPct,
  formatPct,
  friendlyInstallStatus,
  jobPct,
  statusLabel,
  stepStatusIcon,
} from "./download-progress"

describe("friendlyInstallStatus", () => {
  it("simplifies extension pin / restart messages", () => {
    expect(
      friendlyInstallStatus(
        "ComfyUI-QwenVL ready at c522c43 - restart ComfyUI if it was already running"
      )
    ).toBe("ComfyUI-QwenVL ready")
    expect(
      friendlyInstallStatus(
        "Prompt Tools ready — restart ComfyUI if it was already running"
      )
    ).toBe("Prompt Tools ready")
    expect(
      friendlyInstallStatus(
        "Updating ComfyUI-QwenVL to pin c522c43 (required by this app version)…"
      )
    ).toBe("Installing extensions…")
    expect(
      friendlyInstallStatus("Installing ComfyUI-QwenVL Python dependencies…")
    ).toBe("Installing Python dependencies…")
    expect(friendlyInstallStatus("Ensuring ComfyUI-Manager…")).toBe(
      "Installing extensions…"
    )
    expect(friendlyInstallStatus("custom node ready")).toBe("Extensions ready")
  })

  it("leaves plain messages alone", () => {
    expect(friendlyInstallStatus("Installing extensions…")).toBe(
      "Installing extensions…"
    )
    expect(friendlyInstallStatus("Extracting ComfyUI…")).toBe(
      "Extracting ComfyUI…"
    )
  })
})

function step(partial: Partial<DownloadStepView>): DownloadStepView {
  return {
    id: "s1",
    idx: 0,
    stepKind: "http",
    label: "Download",
    status: "running",
    bytesDone: 0,
    bytesTotal: null,
    error: null,
    ...partial,
  }
}

function job(partial: Partial<DownloadJobView>): DownloadJobView {
  return {
    id: "j1",
    jobKey: "k1",
    title: "Model",
    kind: "model",
    status: "running",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    steps: [],
    activeLabel: null,
    downloaded: 0,
    total: null,
    ...partial,
  }
}

describe("statusLabel", () => {
  it("maps known statuses and falls back to Waiting", () => {
    expect(statusLabel("done")).toBe("Ready")
    expect(statusLabel("error")).toBe("Failed")
    expect(statusLabel("cancelled")).toBe("Cancelled")
    expect(statusLabel("paused")).toBe("Paused")
    expect(statusLabel("running")).toBe("Running")
    expect(statusLabel("queued")).toBe("Waiting")
  })
})

describe("jobPct", () => {
  it("uses job totals for http transfer steps", () => {
    expect(
      jobPct(
        job({
          downloaded: 50,
          total: 200,
          steps: [step({ status: "running", stepKind: "http" })],
        })
      )
    ).toBe(25)
  })

  it("returns null for non-http active steps", () => {
    expect(
      jobPct(
        job({
          downloaded: 100,
          total: 100,
          steps: [step({ status: "running", stepKind: "extract" })],
        })
      )
    ).toBeNull()
  })

  it("falls back to active step bytes when job total is missing", () => {
    expect(
      jobPct(
        job({
          steps: [
            step({
              status: "paused",
              stepKind: "http",
              bytesDone: 40,
              bytesTotal: 80,
            }),
          ],
        })
      )
    ).toBe(50)
  })

  it("returns null when no usable totals", () => {
    expect(
      jobPct(
        job({
          total: null,
          steps: [step({ status: "running", bytesTotal: null })],
        })
      )
    ).toBeNull()
    expect(jobPct(job({ total: 0, steps: [] }))).toBeNull()
  })

  it("clamps over 100", () => {
    expect(jobPct(job({ downloaded: 200, total: 100, steps: [step()] }))).toBe(
      100
    )
  })
})

describe("detailPct", () => {
  it("parses and clamps percent from status detail", () => {
    expect(detailPct(null)).toBeNull()
    expect(detailPct(undefined)).toBeNull()
    expect(detailPct("Extracting…")).toBeNull()
    expect(detailPct("Extracting… 20%")).toBe(20)
    expect(detailPct("almost 150%")).toBe(100)
    expect(detailPct("0%")).toBe(0)
  })

  it("returns null when parsed percent is not finite", () => {
    const finite = vi.spyOn(Number, "isFinite").mockReturnValueOnce(false)
    expect(detailPct("12%")).toBeNull()
    finite.mockRestore()
  })
})

describe("formatPct", () => {
  it("formats and clamps", () => {
    expect(formatPct(12.345)).toBe("12.35%")
    expect(formatPct(150)).toBe("100.00%")
  })
})

describe("stepStatusIcon", () => {
  it("maps every status branch", () => {
    expect(stepStatusIcon("done")).toBe("✓")
    expect(stepStatusIcon("error")).toBe("!")
    expect(stepStatusIcon("running")).toBe("●")
    expect(stepStatusIcon("paused")).toBe("●")
    expect(stepStatusIcon("waiting")).toBe("○")
  })
})
