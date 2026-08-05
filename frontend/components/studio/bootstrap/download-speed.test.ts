import { afterEach, describe, expect, it, vi } from "vitest"
import { createDownloadSpeedTracker, SPEED_MIN_MS } from "./download-speed"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("createDownloadSpeedTracker", () => {
  it("tracks EMA speed, resets on done, and ignores finished totals", () => {
    const onSpeed = vi.fn()
    const t = createDownloadSpeedTracker(onSpeed)
    let now = 0
    vi.spyOn(performance, "now").mockImplementation(() => now)

    t.update({ done: false, downloaded: 0, total: null, url: "a" })
    t.update({ done: false, downloaded: 100, total: 50, url: "a" })
    expect(onSpeed).not.toHaveBeenCalled()

    now = 0
    t.update({ done: false, downloaded: 0, total: 1_000_000, url: "a" })
    now = SPEED_MIN_MS - 1
    t.update({ done: false, downloaded: 10_000, total: 1_000_000, url: "a" })
    expect(onSpeed).not.toHaveBeenCalled()

    now = SPEED_MIN_MS
    t.update({ done: false, downloaded: 50_000, total: 1_000_000, url: "a" })
    expect(onSpeed).toHaveBeenCalled()
    expect(t.getEmaSpeed()).toBeGreaterThan(0)

    const first = onSpeed.mock.calls.at(-1)![0] as number
    now = SPEED_MIN_MS + 100
    t.update({ done: false, downloaded: 50_100, total: 1_000_000, url: "a" })
    // tiny delta should not republish
    expect(onSpeed.mock.calls.at(-1)![0]).toBe(first)

    t.update({ done: false, downloaded: 0, total: 1_000_000, url: "b" })
    now = SPEED_MIN_MS * 2
    t.update({ done: false, downloaded: 80_000, total: 1_000_000, url: "b" })
    expect(t.getEmaSpeed()).toBeGreaterThan(0)

    t.update({ done: true, downloaded: 1_000_000, total: 1_000_000, url: "b" })
    expect(t.getEmaSpeed()).toBe(0)
    expect(onSpeed).toHaveBeenLastCalledWith(0)
  })

  it("drops stale samples outside the window and descending bytes", () => {
    const onSpeed = vi.fn()
    const t = createDownloadSpeedTracker(onSpeed)
    let now = 0
    vi.spyOn(performance, "now").mockImplementation(() => now)

    // descending bytes while both samples stay in the window
    t.update({ done: false, downloaded: 1000, total: 1e9, url: "a" })
    now = 100
    t.update({ done: false, downloaded: 500, total: 1e9, url: "a" })

    // stale sample outside SPEED_WINDOW_MS
    now = 0
    t.update({ done: false, downloaded: 0, total: 1e9, url: "c" })
    now = 25_000
    t.update({ done: false, downloaded: 10_000, total: 1e9, url: "c" })
    now = 25_000 + SPEED_MIN_MS
    t.update({ done: false, downloaded: 50_000, total: 1e9, url: "c" })
    expect(onSpeed).toHaveBeenCalled()
  })
})
