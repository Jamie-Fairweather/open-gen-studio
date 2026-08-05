import { describe, expect, it } from "vitest"
import { hfRepoFromModelUrl } from "./hf"

describe("hfRepoFromModelUrl", () => {
  it("extracts org/repo from HF hosts", () => {
    expect(
      hfRepoFromModelUrl(
        "https://huggingface.co/org/repo/resolve/main/x.safetensors"
      )
    ).toEqual({
      id: "org/repo",
      pageUrl: "https://huggingface.co/org/repo",
    })
    expect(
      hfRepoFromModelUrl("https://hf.co/org/repo/blob/main/x.safetensors")
    ).toEqual({
      id: "org/repo",
      pageUrl: "https://huggingface.co/org/repo",
    })
  })

  it("returns null for empty, non-HF, short paths, and invalid URLs", () => {
    expect(hfRepoFromModelUrl("")).toBeNull()
    expect(hfRepoFromModelUrl("   ")).toBeNull()
    expect(hfRepoFromModelUrl("https://example.com/org/repo")).toBeNull()
    expect(hfRepoFromModelUrl("https://huggingface.co/only-org")).toBeNull()
    expect(hfRepoFromModelUrl("not a url")).toBeNull()
  })
})
