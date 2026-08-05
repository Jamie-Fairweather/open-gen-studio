import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/** Packs that must stay off first-run onboarding (HF gated). */
const KNOWN_GATED_IDS = ["sd35-large", "sd35-large-turbo", "flux-dev"] as const

describe("official gated manifests", () => {
  it("sets model.gated so list_blueprints marks requiresHfToken without probing", () => {
    const root = join(process.cwd(), "content/blueprints")
    for (const id of KNOWN_GATED_IDS) {
      const manifest = JSON.parse(
        readFileSync(join(root, id, "manifest.json"), "utf8")
      ) as { models?: { gated?: boolean }[] }
      expect(
        (manifest.models ?? []).some((m) => m.gated === true),
        `${id} should mark at least one model as gated`
      ).toBe(true)
    }
  })

  it("does not ship ungated Stability SD 3.5 packs", () => {
    const root = join(process.cwd(), "content/blueprints")
    for (const id of readdirSync(root)) {
      if (!id.startsWith("sd35")) continue
      const manifest = JSON.parse(
        readFileSync(join(root, id, "manifest.json"), "utf8")
      ) as { models?: { gated?: boolean; url?: string }[] }
      const stability = (manifest.models ?? []).filter((m) =>
        (m.url ?? "").includes("stabilityai/stable-diffusion-3.5")
      )
      expect(stability.length).toBeGreaterThan(0)
      expect(stability.every((m) => m.gated === true)).toBe(true)
    }
  })
})
