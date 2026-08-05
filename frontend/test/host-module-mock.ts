import { vi } from "vitest"
import { createHostMock } from "@/test/mocks/host"

/** Full `@/lib/host` mock for component tests (creator + studio). */
export function createHostModuleMock(overrides: Record<string, unknown> = {}) {
  return createHostMock({
    deleteUserBlueprint: vi.fn(async () => {}),
    deleteUserLora: vi.fn(async () => {}),
    openUserBlueprintsDir: vi.fn(async () => "/blueprints"),
    openUserLorasDir: vi.fn(async () => "/loras"),
    getBlueprint: vi.fn(async () => ({
      id: "bp1",
      name: "BP",
      description: "d",
      arch: "z-image",
      sampler: "euler",
      scheduler: "normal",
      capabilities: { negative: true, loras: true },
      defaults: { steps: 8, cfg: 1, guidance: 3.5 },
      models: [
        {
          role: "unet",
          path: "diffusion_models",
          filename: "m.safetensors",
          url: "https://x/m.safetensors",
        },
      ],
      thumbnailPath: null,
    })),
    getLora: vi.fn(async () => ({
      id: "lora1",
      name: "Lora",
      source: "user",
      arches: ["z-image"],
      variants: [{ arch: "z-image", url: "https://x/a.safetensors" }],
      variantCount: 1,
      variantsReady: 1,
      thumbnailPath: null,
      defaultStrength: 1,
    })),
    saveUserBlueprint: vi.fn(async () => {}),
    saveUserLora: vi.fn(async (pack: { id: string; name: string }) => ({
      id: pack.id,
      name: pack.name,
      source: "user",
      arches: ["z-image"],
      variants: [],
      variantCount: 0,
      variantsReady: 0,
      thumbnailPath: null,
      defaultStrength: 1,
    })),
    setUserBlueprintThumbnail: vi.fn(async () => "/thumb.png"),
    clearUserBlueprintThumbnail: vi.fn(async () => {}),
    setUserLoraThumbnail: vi.fn(async () => "/lora-thumb.png"),
    clearUserLoraThumbnail: vi.fn(async () => {}),
    resolveModelUrl: vi.fn(async (url: string) => ({
      filename: "resolved.safetensors",
      downloadUrl: url,
    })),
    expandCivitaiLoraUrl: vi.fn(async () => ({
      name: "Expanded",
      variants: [{ arch: "z-image", url: "https://civitai.com/dl/1" }],
      skippedBaseModels: ["SD1.5"],
    })),
    getOfficialBlueprint: vi.fn(async (id: string) => ({
      id,
      name: "Official",
      arch: "z-image",
      models: [],
      controls: [],
      defaults: {},
      capabilities: { negative: false, loras: true },
    })),
    ...overrides,
  })
}
