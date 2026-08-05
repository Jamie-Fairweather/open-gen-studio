/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { RuntimeInstall, RuntimePinsStatus } from "@/lib/host"
import { SettingsComfyCard } from "./settings-comfy-card"

const comfy = (status: string, installPath = "/comfy"): RuntimeInstall => ({
  id: "comfy",
  engine: "comfyui",
  version: "v1",
  installPath,
  port: 8188,
  status,
  error: null,
  createdAt: 0,
  updatedAt: 0,
})

describe("SettingsComfyCard", () => {
  it("renders pins/message and wires actions", async () => {
    const user = userEvent.setup()
    const onInstallComfy = vi.fn()
    const onStartComfy = vi.fn()
    const onStopComfy = vi.fn()
    const pins: RuntimePinsStatus = {
      comfy: {
        id: "comfy",
        expected: "v2",
        installed: "v1",
        matches: false,
      },
      nodes: [
        {
          id: "node-a",
          expected: "1",
          installed: null,
          matches: false,
        },
        {
          id: "node-b",
          expected: "1",
          installed: "1",
          matches: true,
        },
      ],
    }

    const { rerender } = render(
      <SettingsComfyCard
        comfy={undefined}
        comfyHealthy={false}
        runtimeMessage={null}
        runtimeBusy={false}
        pins={null}
        onInstallComfy={onInstallComfy}
        onStartComfy={onStartComfy}
        onStopComfy={onStopComfy}
      />
    )
    expect(screen.getByText(/status: -/)).toBeInTheDocument()
    expect(screen.getByText(/healthy: no/)).toBeInTheDocument()

    rerender(
      <SettingsComfyCard
        comfy={comfy("stopped")}
        comfyHealthy
        runtimeMessage="hello"
        runtimeBusy={false}
        pins={pins}
        onInstallComfy={onInstallComfy}
        onStartComfy={onStartComfy}
        onStopComfy={onStopComfy}
      />
    )
    expect(screen.getByText(/healthy: yes/)).toBeInTheDocument()
    expect(screen.getByText(/update pending/)).toBeInTheDocument()
    expect(screen.getByText(/node-a: - \(app expects 1\)/)).toBeInTheDocument()
    expect(screen.getByText(/node-b: 1$/)).toBeInTheDocument()
    expect(screen.getByText("hello")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Reinstall" }))
    await user.click(screen.getByRole("button", { name: "Start" }))
    expect(onInstallComfy).toHaveBeenCalled()
    expect(onStartComfy).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled()

    rerender(
      <SettingsComfyCard
        comfy={comfy("running")}
        comfyHealthy
        runtimeMessage={null}
        runtimeBusy={false}
        pins={{
          comfy: {
            id: "comfy",
            expected: "v1",
            installed: "v1",
            matches: true,
          },
          nodes: [],
        }}
        onInstallComfy={onInstallComfy}
        onStartComfy={onStartComfy}
        onStopComfy={onStopComfy}
      />
    )
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Stop" }))
    expect(onStopComfy).toHaveBeenCalled()

    rerender(
      <SettingsComfyCard
        comfy={comfy("starting", "")}
        comfyHealthy={false}
        runtimeMessage={null}
        runtimeBusy
        pins={null}
        onInstallComfy={onInstallComfy}
        onStartComfy={onStartComfy}
        onStopComfy={onStopComfy}
      />
    )
    expect(screen.getByRole("button", { name: "Reinstall" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled()
  })
})
