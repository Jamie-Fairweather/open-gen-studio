import { describe, expect, it } from "vitest"
import type { Blueprint, RuntimeInstall } from "@/lib/host"
import {
  hasInstalledOfficialBlueprint,
  isComfyReady,
  needsGpuStep,
  needsOnboarding,
  officialBlueprintsForOnboarding,
  parseOnboardingState,
  partitionRecommended,
  recommendedBlurb,
  resolveOnboardingStep,
  serializeOnboardingState,
  stepAfterStorage,
} from "./onboarding"

function bp(partial: Partial<Blueprint> & { id: string }): Blueprint {
  return {
    name: partial.id,
    category: "image",
    description: "",
    arch: "x",
    runtime: "comfyui",
    source: "official",
    minimumVramGb: null,
    modelCount: 1,
    modelsReady: 0,
    totalSizeBytes: null,
    localSizeBytes: 0,
    dir: "",
    thumbnailPath: null,
    ...partial,
  }
}

function runtime(
  partial: Partial<RuntimeInstall> & { status: string }
): RuntimeInstall {
  return {
    id: "r1",
    engine: "comfyui",
    version: "v1",
    installPath: "C:/comfy",
    port: 8188,
    error: null,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe("onboarding helpers", () => {
  it("round-trips onboarding state", () => {
    const state = {
      step: "install" as const,
      blueprintId: "krea2-turbo",
      hfSkipped: true,
    }
    expect(parseOnboardingState(serializeOnboardingState(state))).toEqual(state)
    expect(parseOnboardingState("nope")).toBeNull()
    expect(parseOnboardingState(JSON.stringify({ step: "nope" }))).toBeNull()
    expect(
      parseOnboardingState(
        JSON.stringify({ step: "storage", blueprintId: null, hfSkipped: false })
      )
    ).toEqual({ step: "storage", blueprintId: null, hfSkipped: false })
  })

  it("detects Comfy ready vs not", () => {
    expect(isComfyReady([])).toBe(false)
    expect(
      isComfyReady([runtime({ status: "installing", installPath: "" })])
    ).toBe(false)
    expect(isComfyReady([runtime({ status: "ready" })])).toBe(true)
    expect(isComfyReady([runtime({ status: "running" })])).toBe(true)
  })

  it("gates studio until Comfy and an Official blueprint are ready", () => {
    const installed = bp({ id: "krea2-turbo", modelsReady: 1 })
    expect(needsOnboarding([], [])).toBe(true)
    expect(needsOnboarding([runtime({ status: "ready" })], [])).toBe(true)
    expect(needsOnboarding([runtime({ status: "ready" })], [installed])).toBe(
      false
    )
    expect(hasInstalledOfficialBlueprint([installed])).toBe(true)
    expect(hasInstalledOfficialBlueprint(null)).toBe(false)
    expect(hasInstalledOfficialBlueprint(undefined)).toBe(false)
  })

  it("always hides gated Official blueprints during onboarding", () => {
    const list = officialBlueprintsForOnboarding([
      bp({ id: "a" }),
      bp({ id: "b", requiresHfToken: true }),
      bp({ id: "c", source: "user" }),
      bp({ id: "d", category: "video" }),
    ])
    expect(list.map((b) => b.id)).toEqual(["a"])
    expect(
      officialBlueprintsForOnboarding([
        bp({ id: "b", requiresHfToken: true }),
      ]).map((b) => b.id)
    ).toEqual([])
  })

  it("partitions recommended blueprints in fixed order", () => {
    const { recommended, rest } = partitionRecommended([
      bp({ id: "z-image-turbo", name: "Z" }),
      bp({ id: "other", name: "Other" }),
      bp({ id: "krea2-turbo", name: "Krea" }),
      bp({ id: "flux2-dev", name: "Flux" }),
    ])
    expect(recommended.map((b) => b.id)).toEqual([
      "krea2-turbo",
      "flux2-dev",
      "z-image-turbo",
    ])
    expect(rest.map((b) => b.id)).toEqual(["other"])
  })

  it("resolves step from storage, GPU need, and persisted progress", () => {
    const gpu = {
      available: true,
      name: null,
      memoryTotal: null,
      driverVersion: null,
      vendor: null,
      nvidiaVariant: null,
      needsVendorChoice: true,
      adapters: [],
      error: null,
    }
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu,
        savedVendor: "",
        storageChosen: false,
      })
    ).toBe("storage")
    expect(
      resolveOnboardingStep({
        persisted: { step: "storage", blueprintId: null, hfSkipped: false },
        gpu,
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu,
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu: { ...gpu, needsVendorChoice: false },
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: { step: "blueprint", blueprintId: null, hfSkipped: true },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: { step: "hf", blueprintId: "krea2-turbo", hfSkipped: false },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
      })
    ).toBe("hf")
    expect(
      resolveOnboardingStep({
        persisted: { step: "hf", blueprintId: "krea2-turbo", hfSkipped: false },
        gpu,
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: { step: "blueprint", blueprintId: null, hfSkipped: false },
        gpu,
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: { step: "hf", blueprintId: null, hfSkipped: false },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "install",
          blueprintId: "krea2-turbo",
          hfSkipped: false,
        },
        gpu,
        savedVendor: "",
        storageChosen: true,
      })
    ).toBe("install")
    expect(
      resolveOnboardingStep({
        persisted: { step: "gpu", blueprintId: null, hfSkipped: false },
        gpu: { ...gpu, needsVendorChoice: false },
        savedVendor: "nvidia",
        storageChosen: true,
      })
    ).toBe("blueprint")
    expect(needsGpuStep(gpu, "")).toBe(true)
    expect(needsGpuStep(gpu, "nvidia")).toBe(false)
    expect(stepAfterStorage(gpu, "")).toBe("gpu")
    expect(stepAfterStorage({ ...gpu, needsVendorChoice: false }, "")).toBe(
      "blueprint"
    )
  })

  it("sorts non-recommended blueprints by name", () => {
    const { rest } = partitionRecommended([
      bp({ id: "zeta", name: "Zeta" }),
      bp({ id: "alpha", name: "Alpha" }),
    ])
    expect(rest.map((b) => b.id)).toEqual(["alpha", "zeta"])
  })

  it("returns recommended blurbs only for known ids", () => {
    expect(recommendedBlurb("krea2-turbo")).toEqual(expect.any(String))
    expect(recommendedBlurb("not-a-real-id")).toBeNull()
  })
})
