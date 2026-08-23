import { describe, expect, it } from "vitest"
import type { GpuInfo, SystemSpecs } from "@/lib/host"
import { needsFirstRun, needsOnboarding } from "./helpers"
import { planFirstRunInstall } from "./plan-install"
import { resumeFirstRun } from "./resume"
import type { PlanFirstRunInstallInput } from "./types"

function plan(
  partial: Partial<PlanFirstRunInstallInput> = {}
): PlanFirstRunInstallInput {
  return {
    step: "install",
    blueprintId: "krea2-turbo",
    hidden: false,
    runtimeReady: false,
    runtimeError: false,
    runtimeJobPending: false,
    runtimeInstalling: false,
    runtimeStarted: false,
    blueprintFound: true,
    blueprintInstalled: false,
    blueprintJobError: false,
    blueprintJobQueued: false,
    blueprintStarted: false,
    ...partial,
  }
}

function specs(): SystemSpecs {
  return {
    ramBytes: 32 * 1024 ** 3,
    vramBytes: 12 * 1024 ** 3,
    gpuName: "Test GPU",
  }
}

const gpu: GpuInfo = {
  available: true,
  name: "Test GPU",
  memoryTotal: "12 GiB",
  driverVersion: null,
  vendor: "nvidia",
  nvidiaVariant: null,
  needsVendorChoice: false,
  adapters: [],
  error: null,
}

describe("planFirstRunInstall", () => {
  it("waits until the install step is visible with a Blueprint", () => {
    expect(planFirstRunInstall(plan({ step: "blueprint" }))).toEqual({
      action: "wait",
    })
    expect(planFirstRunInstall(plan({ blueprintId: null }))).toEqual({
      action: "wait",
    })
    expect(planFirstRunInstall(plan({ hidden: true }))).toEqual({
      action: "wait",
    })
  })

  it("finishes when Runtime and the Official Blueprint are Installed", () => {
    expect(
      planFirstRunInstall(
        plan({
          runtimeReady: true,
          blueprintFound: true,
          blueprintInstalled: true,
        })
      )
    ).toEqual({ action: "done" })
  })

  it("starts Runtime, then waits or resets while it is in flight or failed", () => {
    expect(planFirstRunInstall(plan())).toEqual({ action: "start-runtime" })
    expect(planFirstRunInstall(plan({ runtimeStarted: true }))).toEqual({
      action: "wait",
    })
    expect(planFirstRunInstall(plan({ runtimeJobPending: true }))).toEqual({
      action: "wait",
    })
    expect(planFirstRunInstall(plan({ runtimeInstalling: true }))).toEqual({
      action: "wait",
    })
    expect(planFirstRunInstall(plan({ runtimeError: true }))).toEqual({
      action: "reset-runtime-started",
    })
  })

  it("starts the Blueprint only after Runtime is ready", () => {
    expect(planFirstRunInstall(plan({ runtimeReady: true }))).toEqual({
      action: "start-blueprint",
    })
    expect(
      planFirstRunInstall(plan({ runtimeReady: true, runtimeJobPending: true }))
    ).toEqual({ action: "wait" })
    expect(
      planFirstRunInstall(plan({ runtimeReady: true, blueprintStarted: true }))
    ).toEqual({ action: "wait" })
    expect(
      planFirstRunInstall(plan({ runtimeReady: true, blueprintFound: false }))
    ).toEqual({ action: "wait" })
    expect(
      planFirstRunInstall(
        plan({
          runtimeReady: true,
          blueprintInstalled: true,
          blueprintFound: false,
        })
      )
    ).toEqual({ action: "wait" })
  })

  it("marks a queued Blueprint Job and resets after a Job error", () => {
    expect(
      planFirstRunInstall(
        plan({ runtimeReady: true, blueprintJobQueued: true })
      )
    ).toEqual({ action: "mark-blueprint-queued" })
    expect(
      planFirstRunInstall(plan({ runtimeReady: true, blueprintJobError: true }))
    ).toEqual({ action: "reset-blueprint-started" })
  })
})

describe("resumeFirstRun", () => {
  it("prefers the persisted Blueprint, else krea2-turbo, else the first Catalog row", () => {
    const persisted = {
      step: "install" as const,
      blueprintId: "other-official",
      hfSkipped: true,
      specsBypassed: true,
    }
    expect(
      resumeFirstRun({
        persisted,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: false,
        catalog: [{ id: "other-official" }, { id: "krea2-turbo" }],
      })
    ).toEqual({
      step: "install",
      blueprintId: "other-official",
      hfSkipped: true,
      specsBypassed: true,
    })
    expect(
      resumeFirstRun({
        persisted: { ...persisted, blueprintId: "gone" },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: false,
        catalog: [{ id: "flux2-dev" }, { id: "krea2-turbo" }],
      }).blueprintId
    ).toBe("krea2-turbo")
    expect(
      resumeFirstRun({
        persisted: null,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: false,
        catalog: [{ id: "only-pack" }],
      }).blueprintId
    ).toBe("only-pack")
    expect(
      resumeFirstRun({
        persisted: null,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: false,
        catalog: [],
      }).blueprintId
    ).toBeNull()
  })

  it("skips Hugging Face when a token already exists", () => {
    const persisted = {
      step: "hf" as const,
      blueprintId: "krea2-turbo",
      hfSkipped: false,
      specsBypassed: false,
    }
    expect(
      resumeFirstRun({
        persisted,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: true,
        catalog: [{ id: "krea2-turbo" }],
      }).step
    ).toBe("install")
    expect(
      resumeFirstRun({
        persisted,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: true,
        catalog: [],
      }).step
    ).toBe("blueprint")
    expect(
      resumeFirstRun({
        persisted,
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: specs(),
        hasHfToken: false,
        catalog: [{ id: "krea2-turbo" }],
      }).step
    ).toBe("hf")
  })

  it("aliases the studio gate as needsFirstRun", () => {
    expect(needsFirstRun).toBe(needsOnboarding)
  })
})
