import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  downloadUrl: vi.fn(async () => "job1"),
  ensureDownload: vi.fn(async () => ({ status: "queued", jobId: "j1" })),
  listDownloads: vi.fn(async () => ({
    active: null,
    queued: [],
    history: [],
  })),
  pauseDownload: vi.fn(async () => {}),
  resumeDownload: vi.fn(async () => {}),
  cancelDownload: vi.fn(async () => {}),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  cancelDownload,
  downloadUrl,
  ensureDownload,
  listDownloads,
  pauseDownload,
  resumeDownload,
} from "./downloads"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("downloads host wrappers", () => {
  it("delegates with nullish defaults for optional args", async () => {
    await downloadUrl("https://x", "rel/path")
    expect(commands.downloadUrl).toHaveBeenCalledWith(
      "https://x",
      "rel/path",
      null
    )
    await downloadUrl("https://x", "rel/path", "abc")
    expect(commands.downloadUrl).toHaveBeenCalledWith(
      "https://x",
      "rel/path",
      "abc"
    )

    const spec = { url: "https://x", relativePath: "a" } as never
    await ensureDownload(spec)
    expect(commands.ensureDownload).toHaveBeenCalledWith(spec, { wait: false })
    await ensureDownload(spec, { wait: true })
    expect(commands.ensureDownload).toHaveBeenCalledWith(spec, { wait: true })

    await listDownloads()
    await pauseDownload("j1")
    await resumeDownload("j1")
    await cancelDownload("j1")
    expect(commands.cancelDownload).toHaveBeenCalledWith("j1")
  })
})
