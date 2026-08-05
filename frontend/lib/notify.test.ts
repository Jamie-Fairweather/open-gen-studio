import { beforeEach, describe, expect, it, vi } from "vitest"

const toastManager = vi.hoisted(() => ({
  add: vi.fn(),
  close: vi.fn(),
}))

vi.mock("@/components/ui/toast", () => ({ toastManager }))

import {
  notify,
  notifyDismiss,
  notifyError,
  notifyInfo,
  notifyProgress,
  notifySuccess,
} from "./notify"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("notify", () => {
  it("adds toasts and dismisses by id", () => {
    notify({ title: "Hi", description: "d", type: "warning", id: "n1" })
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "n1",
      title: "Hi",
      description: "d",
      type: "warning",
    })

    notifyError("boom")
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "error",
      title: "Something went wrong",
      description: "boom",
      type: "error",
    })
    notifyError("boom", "Custom")
    expect(toastManager.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Custom", type: "error" })
    )

    notifySuccess("ok", "done")
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "success",
      title: "ok",
      description: "done",
      type: "success",
    })

    notifyInfo("info", "body", "i1")
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "i1",
      title: "info",
      description: "body",
      type: "info",
    })

    notifyProgress("p1", "Working", "…")
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "p1",
      title: "Working",
      description: "…",
      type: "loading",
    })
    notifyProgress("p1", "Done", "finished", true)
    expect(toastManager.add).toHaveBeenCalledWith({
      id: "p1",
      title: "Done",
      description: "finished",
      type: "success",
    })

    notifyDismiss("p1")
    expect(toastManager.close).toHaveBeenCalledWith("p1")
  })
})
