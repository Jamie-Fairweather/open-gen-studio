import { afterEach, describe, expect, it, vi } from "vitest"
import {
  beginDataDirMove,
  endDataDirMove,
  getDataDirMoveActive,
  getDataDirMoveProgress,
  subscribeDataDirMove,
  updateDataDirMove,
} from "./data-dir-move"

afterEach(() => {
  endDataDirMove()
})

describe("data-dir-move", () => {
  it("begins, updates, and ends move state for subscribers", () => {
    const listener = vi.fn()
    const unsub = subscribeDataDirMove(listener)

    beginDataDirMove("Starting…")
    expect(getDataDirMoveActive()).toBe(true)
    expect(getDataDirMoveProgress()).toEqual({
      stage: "preparing",
      message: "Starting…",
      current: 0,
      total: 1,
    })
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    updateDataDirMove({
      stage: "moving",
      message: "Moving models…",
      current: 1,
      total: 3,
    })
    expect(getDataDirMoveProgress()?.message).toBe("Moving models…")
    expect(listener).toHaveBeenCalledTimes(1)

    listener.mockClear()
    endDataDirMove()
    expect(getDataDirMoveActive()).toBe(false)
    expect(getDataDirMoveProgress()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)

    unsub()
  })

  it("ignores progress updates when not active", () => {
    expect(getDataDirMoveActive()).toBe(false)
    updateDataDirMove({
      stage: "moving",
      message: "noop",
      current: 1,
      total: 1,
    })
    expect(getDataDirMoveProgress()).toBeNull()
  })

  it("uses the default begin message", () => {
    beginDataDirMove()
    expect(getDataDirMoveProgress()?.message).toBe("Preparing to move library…")
  })
})
