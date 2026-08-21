/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  getDataDirInfo: vi.fn(async () => ({
    path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
    isCustom: false,
    locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
    defaultPath: "C:/Users/test/Open Gen Studio",
    storageChosen: true,
  })),
  openDataDir: vi.fn(async () => "C:/data"),
  pickDataDir: vi.fn(async () => "D:/Open Gen Studio"),
  setDataDir: vi.fn(async () => ({
    path: "D:/Open Gen Studio",
    needsRestart: true,
    migrated: true,
  })),
  relaunchApp: vi.fn(async () => {}),
}))

const notify = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}))

vi.mock("@/lib/host", () => ({
  isTauri: () => host.isTauri(),
  getDataDirInfo: (...a: unknown[]) => host.getDataDirInfo(...a),
  openDataDir: (...a: unknown[]) => host.openDataDir(...a),
  pickDataDir: (...a: unknown[]) => host.pickDataDir(...a),
  setDataDir: (...a: unknown[]) => host.setDataDir(...a),
  relaunchApp: (...a: unknown[]) => host.relaunchApp(...a),
}))

vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notify.notifyError(...a),
  notifySuccess: (...a: unknown[]) => notify.notifySuccess(...a),
}))

import { endDataDirMove, getDataDirMoveActive } from "@/lib/data-dir-move"
import { SettingsModelsCard } from "./settings-models-card"

describe("SettingsModelsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    endDataDirMove()
    host.isTauri.mockReturnValue(true)
    host.getDataDirInfo.mockResolvedValue({
      path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      isCustom: false,
      locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
      defaultPath: "C:/Users/test/Open Gen Studio",
      storageChosen: true,
    })
    host.pickDataDir.mockResolvedValue("D:/Open Gen Studio")
    host.setDataDir.mockResolvedValue({
      path: "D:/Open Gen Studio",
      needsRestart: true,
      migrated: true,
    })
    host.openDataDir.mockResolvedValue("C:/data")
  })

  afterEach(() => {
    endDataDirMove()
  })

  it("browses models and shows data path", async () => {
    const user = userEvent.setup()
    const onBrowseModels = vi.fn()
    render(<SettingsModelsCard onBrowseModels={onBrowseModels} />)
    await waitFor(() => {
      expect(
        screen.getByText("C:/Users/test/AppData/Roaming/Open Gen Studio")
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Browse models/i }))
    expect(onBrowseModels).toHaveBeenCalled()
  })

  it("changes location and relaunches when needed", async () => {
    const user = userEvent.setup()
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Change location/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Change location/i }))
    await waitFor(() => {
      expect(host.setDataDir).toHaveBeenCalledWith("D:/Open Gen Studio")
      expect(host.relaunchApp).toHaveBeenCalled()
    })
  })

  it("opens the data folder", async () => {
    const user = userEvent.setup()
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Open folder/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Open folder/i }))
    expect(host.openDataDir).toHaveBeenCalled()
  })

  it("updates without restart and ends the move overlay", async () => {
    const user = userEvent.setup()
    host.setDataDir.mockResolvedValueOnce({
      path: "D:/Open Gen Studio",
      needsRestart: false,
      migrated: false,
    })
    host.getDataDirInfo
      .mockResolvedValueOnce({
        path: "C:/Users/test/AppData/Roaming/Open Gen Studio",
        isCustom: false,
        locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
        defaultPath: "C:/Users/test/Open Gen Studio",
        storageChosen: true,
      })
      .mockResolvedValueOnce({
        path: "D:/Open Gen Studio",
        isCustom: true,
        locatorPath: "C:/Users/test/AppData/Roaming/Open Gen Studio",
        defaultPath: "C:/Users/test/Open Gen Studio",
        storageChosen: true,
      })
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Change location/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Change location/i }))
    await waitFor(() => {
      expect(notify.notifySuccess).toHaveBeenCalledWith(
        "Data folder updated",
        "D:/Open Gen Studio"
      )
    })
    expect(host.relaunchApp).not.toHaveBeenCalled()
    expect(getDataDirMoveActive()).toBe(false)
  })

  it("ends the move overlay and notifies on setDataDir failure", async () => {
    const user = userEvent.setup()
    host.setDataDir.mockRejectedValueOnce(new Error("disk full"))
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Change location/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Change location/i }))
    await waitFor(() => {
      expect(notify.notifyError).toHaveBeenCalledWith(
        "disk full",
        "Could not change data folder"
      )
    })
    expect(getDataDirMoveActive()).toBe(false)
  })

  it("notifies when opening the data folder fails", async () => {
    const user = userEvent.setup()
    host.openDataDir.mockRejectedValueOnce("nope")
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Open folder/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Open folder/i }))
    await waitFor(() => {
      expect(notify.notifyError).toHaveBeenCalledWith(
        "nope",
        "Could not open data folder"
      )
    })
  })

  it("does nothing when the folder picker is cancelled", async () => {
    const user = userEvent.setup()
    host.pickDataDir.mockResolvedValueOnce(null)
    render(<SettingsModelsCard onBrowseModels={() => {}} />)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Change location/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Change location/i }))
    await waitFor(() => expect(host.pickDataDir).toHaveBeenCalled())
    expect(host.setDataDir).not.toHaveBeenCalled()
    expect(getDataDirMoveActive()).toBe(false)
  })
})
