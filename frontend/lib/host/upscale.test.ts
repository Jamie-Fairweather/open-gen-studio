import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  listUpscalers: vi.fn(async () => []),
  installUpscaler: vi.fn(async () => {}),
  ensureUsduNode: vi.fn(async () => {}),
  usduNodeReady: vi.fn(async () => true),
  ensureSupirNode: vi.fn(async () => {}),
  supirNodeReady: vi.fn(async () => false),
}))

vi.mock("@/lib/generated/bindings", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/generated/bindings")>()
  return { ...actual, commands }
})
import {
  defaultUsduDenoise,
  defaultUsduSteps,
  ensureSupirNode,
  ensureUsduNode,
  installUpscaler,
  listUpscalers,
  supirNodeReady,
  usduNodeReady,
} from "./upscale"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("defaultUsduSteps / defaultUsduDenoise", () => {
  it("branches by arch family and unknown/null arch", () => {
    expect(defaultUsduSteps("krea2")).toBe(8)
    expect(defaultUsduSteps("z-image")).toBe(8)
    expect(defaultUsduSteps("flux")).toBe(12)
    expect(defaultUsduSteps(null)).toBe(12)
    expect(defaultUsduSteps("not-arch")).toBe(12)
    expect(defaultUsduSteps()).toBe(12)

    expect(defaultUsduDenoise("krea2")).toBe(0.15)
    expect(defaultUsduDenoise("z-image")).toBe(0.15)
    expect(defaultUsduDenoise("flux")).toBe(0.2)
    expect(defaultUsduDenoise("flux2")).toBe(0.2)
    expect(defaultUsduDenoise("ideogram4")).toBe(0.2)
    expect(defaultUsduDenoise("sdxl")).toBe(0.25)
    expect(defaultUsduDenoise(null)).toBe(0.25)
    expect(defaultUsduDenoise("nope")).toBe(0.25)
    expect(defaultUsduDenoise()).toBe(0.25)
  })
})

describe("upscale host wrappers", () => {
  it("delegates list/install/node readiness", async () => {
    await listUpscalers()
    await installUpscaler("4x")
    await ensureUsduNode()
    await usduNodeReady()
    await ensureSupirNode()
    await supirNodeReady()
    expect(commands.supirNodeReady).toHaveBeenCalled()
  })
})
