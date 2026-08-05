import { beforeEach, describe, expect, it, vi } from "vitest"

const listen = vi.hoisted(() =>
  vi.fn(async (_event: string, handler: (e: { payload: unknown }) => void) => {
    handler({ payload: "payload" })
    return () => {}
  })
)

vi.mock("@tauri-apps/api/event", () => ({ listen }))

import {
  onBlueprintProbe,
  onBlueprintProgress,
  onBlueprintSizes,
  onBlueprintsUpdated,
  onDownloadManager,
  onDownloadProgress,
  onGalleryDeleted,
  onGalleryUpdated,
  onJobHistory,
  onJobProgress,
  onJobQueue,
  onJobsUpdated,
  onLoraProgress,
  onLorasUpdated,
  onPromptToolsProgress,
  onRuntimeProgress,
  onRuntimesUpdated,
  onUpscaleProgress,
  onUpscalersUpdated,
  onDataDirProgress,
  onDataDirCloseBlocked,
} from "./events"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("host event listeners", () => {
  it("subscribes and forwards payloads for every channel", async () => {
    const cases: Array<{
      fn: (h: (p: never) => void) => Promise<() => void>
      event: string
      withPayload: boolean
    }> = [
      { fn: onGalleryDeleted, event: "gallery://deleted", withPayload: true },
      { fn: onJobsUpdated, event: "jobs://updated", withPayload: true },
      { fn: onGalleryUpdated, event: "gallery://updated", withPayload: true },
      {
        fn: onDownloadProgress,
        event: "downloads://progress",
        withPayload: true,
      },
      {
        fn: onDownloadManager,
        event: "downloads://manager",
        withPayload: true,
      },
      { fn: onLorasUpdated, event: "loras://updated", withPayload: true },
      { fn: onLoraProgress, event: "loras://progress", withPayload: true },
      {
        fn: onUpscalersUpdated,
        event: "upscale://updated",
        withPayload: true,
      },
      {
        fn: onUpscaleProgress,
        event: "upscale://progress",
        withPayload: true,
      },
      {
        fn: onPromptToolsProgress,
        event: "prompt-tools://progress",
        withPayload: true,
      },
      { fn: onJobProgress, event: "jobs://progress", withPayload: true },
      { fn: onJobQueue, event: "jobs://queue", withPayload: true },
      { fn: onJobHistory, event: "jobs://history", withPayload: false },
      {
        fn: onBlueprintProgress,
        event: "blueprints://progress",
        withPayload: true,
      },
      {
        fn: onBlueprintsUpdated,
        event: "blueprints://updated",
        withPayload: true,
      },
      {
        fn: onBlueprintSizes,
        event: "blueprints://sizes",
        withPayload: true,
      },
      {
        fn: onBlueprintProbe,
        event: "blueprints://probe",
        withPayload: true,
      },
      {
        fn: onRuntimesUpdated,
        event: "runtimes://updated",
        withPayload: true,
      },
      {
        fn: onRuntimeProgress,
        event: "runtimes://progress",
        withPayload: true,
      },
      {
        fn: onDataDirProgress,
        event: "data-dir://progress",
        withPayload: true,
      },
      {
        fn: onDataDirCloseBlocked,
        event: "data-dir://close-blocked",
        withPayload: true,
      },
    ]

    for (const { fn, event, withPayload } of cases) {
      const handler = vi.fn()
      await fn(handler as never)
      expect(listen).toHaveBeenCalledWith(event, expect.any(Function))
      if (withPayload) {
        expect(handler).toHaveBeenCalledWith("payload")
      } else {
        expect(handler).toHaveBeenCalledWith()
      }
    }
  })
})
