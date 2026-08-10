import { describe, expect, it } from "vitest"
import type { Blueprint, RuntimeInstall, SystemSpecs } from "@/lib/host"
import {
  bytesToGb,
  forceOnboardingSpecs,
  formatSpecGb,
  mergeSystemSpecs,
  vramBytesFromGpu,
  hasInstalledOfficialBlueprint,
  isComfyReady,
  meetsMinimumSpecs,
  needsGpuStep,
  needsOnboarding,
  needsSpecsStep,
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

function specs(partial: Partial<SystemSpecs> = {}): SystemSpecs {
  return {
    ramBytes: 32 * 1024 ** 3,
    vramBytes: 12 * 1024 ** 3,
    gpuName: "Test GPU",
    ...partial,
  }
}

describe("onboarding helpers", () => {
  it("round-trips onboarding state", () => {
    const state = {
      step: "install" as const,
      blueprintId: "krea2-turbo",
      hfSkipped: true,
      specsBypassed: true,
    }
    expect(parseOnboardingState(serializeOnboardingState(state))).toEqual(state)
    expect(parseOnboardingState("nope")).toBeNull()
    expect(parseOnboardingState(JSON.stringify({ step: "nope" }))).toBeNull()
    expect(
      parseOnboardingState(
        JSON.stringify({ step: "storage", blueprintId: null, hfSkipped: false })
      )
    ).toEqual({
      step: "storage",
      blueprintId: null,
      hfSkipped: false,
      specsBypassed: false,
    })
    expect(
      parseOnboardingState(
        JSON.stringify({ step: "specs", blueprintId: null, hfSkipped: false })
      )
    ).toEqual({
      step: "specs",
      blueprintId: null,
      hfSkipped: false,
      specsBypassed: false,
    })
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

  it("gates on RAM/VRAM minimums and fails closed for unknown VRAM", () => {
    expect(meetsMinimumSpecs(specs())).toBe(true)
    expect(
      meetsMinimumSpecs(
        specs({ ramBytes: 8 * 1024 ** 3, vramBytes: 12 * 1024 ** 3 })
      )
    ).toBe(false)
    expect(
      meetsMinimumSpecs(
        specs({ ramBytes: 32 * 1024 ** 3, vramBytes: 4 * 1024 ** 3 })
      )
    ).toBe(false)
    expect(meetsMinimumSpecs(specs({ vramBytes: null }))).toBe(false)
    expect(needsSpecsStep({ specs: specs(), specsBypassed: false })).toBe(false)
    expect(
      needsSpecsStep({
        specs: specs({ vramBytes: null }),
        specsBypassed: false,
      })
    ).toBe(true)
    expect(
      needsSpecsStep({
        specs: specs({ vramBytes: null }),
        specsBypassed: true,
      })
    ).toBe(false)
    expect(bytesToGb(8 * 1024 ** 3)).toBe(8)
    expect(formatSpecGb(8)).toBe("8 GB")
    expect(formatSpecGb(null)).toBe("Unknown")
  })

  it("forceOnboardingSpecs env previews Hardware even when over min", () => {
    const prev = process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS
    try {
      process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS = "1"
      expect(forceOnboardingSpecs()).toBe(true)
      expect(needsSpecsStep({ specs: specs(), specsBypassed: false })).toBe(
        true
      )
      expect(needsSpecsStep({ specs: specs(), specsBypassed: true })).toBe(
        false
      )
      expect(
        needsOnboarding(
          [runtime({ status: "ready" })],
          [bp({ id: "krea2-turbo", modelsReady: 1 })]
        )
      ).toBe(true)
      expect(
        resolveOnboardingStep({
          persisted: {
            step: "blueprint",
            blueprintId: "krea2-turbo",
            hfSkipped: false,
            specsBypassed: true,
          },
          gpu: null,
          savedVendor: "nvidia",
          storageChosen: true,
          specs: specs(),
        })
      ).toBe("specs")
      process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS = "0"
      expect(forceOnboardingSpecs()).toBe(false)
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS
      } else {
        process.env.NEXT_PUBLIC_FORCE_ONBOARDING_SPECS = prev
      }
    }
  })

  it("merges VRAM from GpuInfo when system specs are missing", () => {
    const gpu = {
      available: true,
      name: "NVIDIA GeForce RTX 4080 SUPER",
      memoryTotal: "16376 MiB",
      driverVersion: null,
      vendor: "nvidia" as const,
      nvidiaVariant: null,
      needsVendorChoice: true,
      adapters: [
        {
          vendor: "nvidia" as const,
          name: "NVIDIA GeForce RTX 4080 SUPER",
          memoryTotal: "16376 MiB",
          driverVersion: null,
          computeCap: null,
          cudaVersion: null,
        },
        {
          vendor: "amd" as const,
          name: "AMD Radeon(TM) Graphics",
          memoryTotal: "512 MiB",
          driverVersion: null,
          computeCap: null,
          cudaVersion: null,
        },
      ],
      error: null,
    }
    expect(vramBytesFromGpu(gpu)).toBe(16376 * 1024 ** 2)
    const merged = mergeSystemSpecs(
      { ramBytes: 32 * 1024 ** 3, vramBytes: null, gpuName: null },
      gpu
    )
    expect(merged.vramBytes).toBe(16376 * 1024 ** 2)
    expect(merged.gpuName).toBe("NVIDIA GeForce RTX 4080 SUPER")
    expect(meetsMinimumSpecs(merged)).toBe(true)

    // Unit / invalid / fallbacks for memoryTotalToBytes + mergeSystemSpecs.
    expect(
      vramBytesFromGpu({
        ...gpu,
        memoryTotal: "2 TiB",
        adapters: [{ ...gpu.adapters[0], memoryTotal: "1 GiB" }],
      })
    ).toBe(2 * 1024 ** 4)
    expect(
      vramBytesFromGpu({
        ...gpu,
        memoryTotal: "not-a-size",
        adapters: [{ ...gpu.adapters[0], memoryTotal: "0 MiB" }],
      })
    ).toBeNull()
    expect(
      vramBytesFromGpu({
        ...gpu,
        memoryTotal: null,
        adapters: [{ ...gpu.adapters[0], memoryTotal: null }],
      })
    ).toBeNull()
    expect(
      mergeSystemSpecs(
        { ramBytes: null, vramBytes: 8 * 1024 ** 3, gpuName: "Fallback" },
        null
      )
    ).toEqual({
      ramBytes: null,
      vramBytes: 8 * 1024 ** 3,
      gpuName: "Fallback",
    })
    expect(
      mergeSystemSpecs(null, {
        ...gpu,
        name: null,
        adapters: [
          {
            vendor: "amd" as const,
            name: "RX 7900",
            memoryTotal: "20 GiB",
            driverVersion: null,
            computeCap: null,
            cudaVersion: null,
          },
        ],
      }).gpuName
    ).toBe("RX 7900")
  })

  it("resolves step from specs, storage, GPU need, and persisted progress", () => {
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
    const under = specs({ vramBytes: 2 * 1024 ** 3 })
    const ok = specs()
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu,
        savedVendor: "",
        storageChosen: false,
        specs: under,
      })
    ).toBe("specs")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "specs",
          blueprintId: null,
          hfSkipped: false,
          specsBypassed: true,
        },
        gpu,
        savedVendor: "",
        storageChosen: false,
        specs: under,
      })
    ).toBe("storage")
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu,
        savedVendor: "",
        storageChosen: false,
        specs: ok,
      })
    ).toBe("storage")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "storage",
          blueprintId: null,
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu,
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: null,
        gpu: { ...gpu, needsVendorChoice: false },
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "blueprint",
          blueprintId: null,
          hfSkipped: true,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "hf",
          blueprintId: "krea2-turbo",
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("hf")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "hf",
          blueprintId: "krea2-turbo",
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "blueprint",
          blueprintId: null,
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("gpu")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "hf",
          blueprintId: null,
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "nvidia",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("blueprint")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "install",
          blueprintId: "krea2-turbo",
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu,
        savedVendor: "",
        storageChosen: true,
        specs: ok,
      })
    ).toBe("install")
    expect(
      resolveOnboardingStep({
        persisted: {
          step: "gpu",
          blueprintId: null,
          hfSkipped: false,
          specsBypassed: false,
        },
        gpu: { ...gpu, needsVendorChoice: false },
        savedVendor: "nvidia",
        storageChosen: true,
        specs: ok,
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
