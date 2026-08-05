/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  listSettings: vi.fn(async () => ({ k: "v" })),
  setSetting: vi.fn(async () => {}),
  setProviderToken: vi.fn(async () => {}),
  clearProviderToken: vi.fn(async () => {}),
  providerTokenStatus: vi.fn(async () => ({
    huggingface: false,
    civitai: false,
  })),
  detectGpu: vi.fn(async () => ({
    available: false,
    needsVendorChoice: false,
    adapters: [],
  })),
  listRuntimes: vi.fn(async () => []),
  installComfyui: vi.fn(async () => ({ id: "comfy" })),
  startComfyui: vi.fn(async () => ({ id: "comfy" })),
  stopComfyui: vi.fn(async () => ({ id: "comfy" })),
  comfyuiStatus: vi.fn(async () => ({
    processAlive: false,
    healthy: false,
    port: 0,
    runtime: null,
  })),
  runtimePinsStatus: vi.fn(async () => ({
    comfy: { expected: "v1", installed: null, matches: false },
  })),
  openExternalUrl: vi.fn(async () => {}),
  creatorEnsureComfy: vi.fn(async () => "ok"),
  creatorOpenComfy: vi.fn(async () => "http://127.0.0.1"),
  creatorCaptureWorkflow: vi.fn(async () => ({ workflow: {} })),
  creatorSuggestPackaging: vi.fn(async () => ({ models: [], controls: [] })),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  clearProviderToken,
  comfyuiStatus,
  creatorCaptureWorkflow,
  creatorEnsureComfy,
  creatorOpenComfy,
  creatorSuggestPackaging,
  detectGpu,
  installComfyui,
  isTauri,
  listRuntimes,
  listSettings,
  openExternalUrl,
  providerTokenStatus,
  runtimePinsStatus,
  setProviderToken,
  setSetting,
  startComfyui,
  stopComfyui,
} from "./runtime"

beforeEach(() => {
  vi.clearAllMocks()
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__
  delete (window as Window & { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__
})

afterEach(() => {
  delete (window as Window & { __TAURI__?: unknown }).__TAURI__
  delete (window as Window & { __TAURI_INTERNALS__?: unknown })
    .__TAURI_INTERNALS__
})

describe("isTauri", () => {
  it("detects Tauri globals on window", () => {
    expect(isTauri()).toBe(false)
    ;(window as Window & { __TAURI__: object }).__TAURI__ = {}
    expect(isTauri()).toBe(true)
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__
    ;(window as Window & { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ =
      {}
    expect(isTauri()).toBe(true)
  })
})
describe("runtime command wrappers", () => {
  it("delegates settings, tokens, gpu, and comfy lifecycle", async () => {
    await expect(listSettings()).resolves.toEqual({ k: "v" })
    await setSetting("a", "b")
    expect(commands.setSetting).toHaveBeenCalledWith("a", "b")
    await setProviderToken("huggingface", "tok")
    expect(commands.setProviderToken).toHaveBeenCalledWith("huggingface", "tok")
    await clearProviderToken("civitai")
    expect(commands.clearProviderToken).toHaveBeenCalledWith("civitai")
    await providerTokenStatus()
    expect(commands.providerTokenStatus).toHaveBeenCalled()
    await detectGpu()
    await listRuntimes()
    await installComfyui()
    await startComfyui()
    await stopComfyui()
    await comfyuiStatus()
    await runtimePinsStatus()
    await creatorEnsureComfy()
    await creatorOpenComfy()
    await creatorCaptureWorkflow()
    await creatorSuggestPackaging({ nodes: [] })
    expect(commands.creatorSuggestPackaging).toHaveBeenCalledWith(
      { nodes: [] },
      null
    )
    await creatorSuggestPackaging({ nodes: [] }, [{ path: "m.safetensors" }])
    expect(commands.creatorSuggestPackaging).toHaveBeenCalledWith(
      { nodes: [] },
      [{ path: "m.safetensors" }]
    )
  })

  it("opens external urls via window or Tauri command", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    await openExternalUrl("https://example.com")
    expect(open).toHaveBeenCalledWith(
      "https://example.com",
      "_blank",
      "noopener,noreferrer"
    )
    expect(commands.openExternalUrl).not.toHaveBeenCalled()

    ;(window as Window & { __TAURI__: object }).__TAURI__ = {}
    await openExternalUrl("https://tauri.dev")
    expect(commands.openExternalUrl).toHaveBeenCalledWith("https://tauri.dev")
    open.mockRestore()
  })
})
