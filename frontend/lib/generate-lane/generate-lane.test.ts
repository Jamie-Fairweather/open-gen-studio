import { describe, expect, it, vi } from "vitest"
import type { JobQueueItem } from "@/lib/host"
import { applyGenerateQueue } from "./apply-queue"
import { planGenerateJobUpdate, planGenerateProgress } from "./apply-progress"
import { finishGenerateJob, finishGenerateLane } from "./finish"
import { planGenerateLane } from "./plan-lane"
import { planGenerateSubmit } from "./plan-submit"

function item(
  partial: Partial<JobQueueItem> & Pick<JobQueueItem, "jobId" | "kind">
): JobQueueItem {
  return {
    label: partial.jobId,
    status: "queued",
    prompt: null,
    meta: null,
    ...partial,
  }
}

describe("planGenerateSubmit", () => {
  it("gates Catalog, Blueprint, install, and prompt before submit", () => {
    expect(
      planGenerateSubmit({
        catalogReady: false,
        blueprintId: "bp1",
        installed: true,
        prompt: "cat",
      })
    ).toEqual({ action: "wait-catalog" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: null,
        installed: false,
        prompt: "cat",
      })
    ).toEqual({ action: "pick-blueprint" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: "bp1",
        installed: false,
        modelsReady: 0,
        modelCount: 2,
        prompt: "cat",
      })
    ).toEqual({ action: "install-first" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: "bp1",
        installed: false,
        prompt: "cat",
      })
    ).toEqual({ action: "install-first" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: "bp1",
        installed: true,
        prompt: "  ",
      })
    ).toEqual({ action: "need-prompt" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: "bp1",
        installed: true,
        prompt: "cat",
      })
    ).toEqual({ action: "submit", blueprintId: "bp1" })
    expect(
      planGenerateSubmit({
        catalogReady: true,
        blueprintId: "bp1",
        installed: false,
        modelsReady: 0,
        modelCount: 0,
        prompt: "cat",
      })
    ).toEqual({ action: "submit", blueprintId: "bp1" })
  })
})

describe("planGenerateLane", () => {
  it("starts a fresh lane or enqueues behind the running Job", () => {
    expect(planGenerateLane({ generating: false, runningJobId: null })).toEqual(
      { action: "start-lane", followLive: true }
    )
    expect(planGenerateLane({ generating: true, runningJobId: null })).toEqual({
      action: "start-lane",
      followLive: false,
    })
    expect(
      planGenerateLane({ generating: false, runningJobId: "run1" })
    ).toEqual({
      action: "enqueue",
      runningJobId: "run1",
      followLive: true,
    })
    expect(
      planGenerateLane({ generating: true, runningJobId: "run1" })
    ).toEqual({
      action: "enqueue",
      runningJobId: "run1",
      followLive: false,
    })
  })
})

describe("finishGenerateLane", () => {
  it("keeps the lane live while other generate Jobs remain", () => {
    expect(
      finishGenerateLane({
        jobId: "a",
        queue: [
          item({ jobId: "a", kind: "generate" }),
          item({ jobId: "b", kind: "generate" }),
        ],
        activeJobId: "a",
      })
    ).toEqual({
      queue: [item({ jobId: "b", kind: "generate" })],
      generating: true,
      activeJobId: null,
      clearPreview: false,
    })
    expect(
      finishGenerateLane({
        jobId: "b",
        queue: [item({ jobId: "b", kind: "generate" })],
        activeJobId: "other",
      })
    ).toEqual({
      queue: [],
      generating: false,
      activeJobId: "other",
      clearPreview: true,
    })
  })

  it("applies finish onto a host", () => {
    const store = {
      jobQueue: [item({ jobId: "a", kind: "generate" })],
      activeJobId: "a",
      setJobQueue: vi.fn(),
      setGenerating: vi.fn(),
      setActiveJobId: vi.fn(),
      clearLivePreview: vi.fn(),
    }
    finishGenerateJob(() => store, "a")
    expect(store.setJobQueue).toHaveBeenCalledWith([])
    expect(store.setGenerating).toHaveBeenCalledWith(false)
    expect(store.setActiveJobId).toHaveBeenCalledWith(null)
    expect(store.clearLivePreview).toHaveBeenCalled()
  })
})

describe("applyGenerateQueue", () => {
  it("tracks the running generate Job, then queued, then idle", () => {
    expect(
      applyGenerateQueue([
        item({ jobId: "run", kind: "generate", status: "running" }),
      ])
    ).toEqual({ action: "running", jobId: "run" })
    expect(
      applyGenerateQueue([
        item({ jobId: "q", kind: "generate", status: "queued" }),
      ])
    ).toEqual({ action: "queued" })
    expect(
      applyGenerateQueue([item({ jobId: "t", kind: "promptTools" })])
    ).toEqual({ action: "idle" })
  })
})

describe("planGenerateProgress", () => {
  it("maps Engine progress onto lane actions", () => {
    expect(
      planGenerateProgress({
        stage: "start",
        jobId: "g",
        message: "boot",
      })
    ).toEqual({ action: "runtime-start", message: "boot" })
    expect(planGenerateProgress({ stage: "start", jobId: "g" })).toEqual({
      action: "runtime-start",
      message: "",
    })
    expect(
      planGenerateProgress({
        stage: "step",
        jobId: "g",
        step: 1,
        max: 2,
      })
    ).toEqual({ action: "step", jobId: "g", step: 1, max: 2 })
    expect(
      planGenerateProgress({
        stage: "step",
        jobId: "g",
        step: null,
        max: 2,
      })
    ).toEqual({ action: "dismiss-runtime" })
    expect(
      planGenerateProgress({
        stage: "preview",
        jobId: "g",
        previewPath: "/p.png",
      })
    ).toEqual({ action: "preview", path: "/p.png" })
    expect(planGenerateProgress({ stage: "preview", jobId: "g" })).toEqual({
      action: "dismiss-runtime",
    })
    expect(planGenerateProgress({ stage: "done", jobId: "g" })).toEqual({
      action: "finish",
      notify: null,
    })
    expect(
      planGenerateProgress({
        stage: "cancelled",
        jobId: "g",
        message: "c",
      })
    ).toEqual({ action: "finish", notify: "cancelled", message: "c" })
    expect(planGenerateProgress({ stage: "cancelled", jobId: "g" })).toEqual({
      action: "finish",
      notify: "cancelled",
      message: "",
    })
    expect(
      planGenerateProgress({ stage: "error", jobId: "g", message: "e" })
    ).toEqual({ action: "finish", notify: "error", message: "e" })
    expect(planGenerateProgress({ stage: "error", jobId: "g" })).toEqual({
      action: "finish",
      notify: "error",
      message: "",
    })
    expect(planGenerateProgress({ stage: "run", jobId: "g" })).toEqual({
      action: "dismiss-runtime",
    })
  })
})

describe("planGenerateJobUpdate", () => {
  it("finishes generate Jobs and only prunes other kinds when terminal", () => {
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "generate",
        status: "running",
      })
    ).toEqual({ action: "ignore" })
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "other",
        status: "completed",
      })
    ).toEqual({ action: "prune" })
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "generate",
        status: "failed",
        error: "boom",
      })
    ).toEqual({ action: "finish", notify: "failed", message: "boom" })
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "generate",
        status: "failed",
        error: null,
      })
    ).toEqual({ action: "finish", notify: null })
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "generate",
        status: "cancelled",
      })
    ).toEqual({ action: "finish", notify: "cancelled" })
    expect(
      planGenerateJobUpdate({
        id: "j",
        kind: "generate",
        status: "completed",
      })
    ).toEqual({ action: "finish", notify: null })
  })
})
