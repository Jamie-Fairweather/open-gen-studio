import { describe, expect, it } from "vitest"
import type { ArchDef } from "@/lib/creator-arches"
import {
  draftsForArch,
  filenameFromUrl,
  needsProviderResolve,
  slugify,
} from "./recipe-form-helpers"

describe("slugify", () => {
  it("normalizes, trims edges, and caps length", () => {
    expect(slugify("  Hello World!!  ")).toBe("hello-world")
    expect(slugify("a".repeat(80))).toHaveLength(64)
  })
})

describe("filenameFromUrl", () => {
  it("takes the last path segment and strips query/hash", () => {
    expect(
      filenameFromUrl("https://cdn.example/models/foo.safetensors?token=1#x")
    ).toBe("foo.safetensors")
    expect(filenameFromUrl("not a url /path/bar.gguf?q=1")).toBe("bar.gguf")
    expect(filenameFromUrl("")).toBe("")
    expect(filenameFromUrl("https://cdn.example/")).toBe("")
  })

  it("returns raw segment when decodeURIComponent throws", () => {
    expect(filenameFromUrl("https://cdn.example/foo%GGbar.safetensors")).toBe(
      "foo%GGbar.safetensors"
    )
    expect(filenameFromUrl("not-a-url/foo%GGbar.gguf")).toBe("foo%GGbar.gguf")
  })

  it("uses catch-path split when URL constructor throws", () => {
    expect(filenameFromUrl("://bad/scheme/file.safetensors?q=1")).toBe(
      "file.safetensors"
    )
    expect(filenameFromUrl("relative/path/no-ext")).toBe("no-ext")
    expect(filenameFromUrl("?only=query")).toBe("")
    expect(filenameFromUrl("relative/path/")).toBe("path")
  })
})

describe("needsProviderResolve", () => {
  it("resolves CivitAI pages and extensionless URLs", () => {
    expect(needsProviderResolve("https://civitai.com/models/123")).toBe(true)
    expect(needsProviderResolve("https://civitai.red/models/1")).toBe(true)
    expect(
      needsProviderResolve("https://huggingface.co/org/repo/resolve/main/x")
    ).toBe(true)
    expect(
      needsProviderResolve(
        "https://huggingface.co/org/repo/resolve/main/x.safetensors"
      )
    ).toBe(false)
    expect(needsProviderResolve("")).toBe(false)
  })
})

describe("draftsForArch", () => {
  it("maps slots with and without defaultUrl", () => {
    const arch = {
      slots: [
        {
          role: "unet",
          path: "diffusion_models",
          label: "UNet",
          required: true,
          defaultUrl: "https://cdn.example/a.safetensors",
        },
        {
          role: "vae",
          path: "vae",
          label: "VAE",
          required: true,
        },
      ],
    } as ArchDef
    expect(draftsForArch(arch)).toEqual([
      {
        role: "unet",
        path: "diffusion_models",
        filename: "a.safetensors",
        url: "https://cdn.example/a.safetensors",
      },
      { role: "vae", path: "vae", filename: "", url: "" },
    ])
  })
})
