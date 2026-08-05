import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  listBlueprints: vi.fn(async () => [{ id: "bp1" }]),
  resolveModelUrl: vi.fn(async () => ({
    url: "https://x/y",
    filename: "y.safetensors",
  })),
  installOfficialBlueprint: vi.fn(async () => {}),
  uninstallBlueprint: vi.fn(async () => ({ removed: 1, kept: 0 })),
  cancelBlueprintInstall: vi.fn(async () => {}),
  listModelFiles: vi.fn(async () => []),
  openModelsDir: vi.fn(async () => "/models"),
  getBlueprint: vi.fn(async () => ({ id: "bp1", controls: [] })),
  saveUserBlueprint: vi.fn(async () => "user-bp"),
  deleteUserBlueprint: vi.fn(async () => {}),
  openUserBlueprintsDir: vi.fn(async () => "/user-bps"),
  setUserBlueprintThumbnail: vi.fn(async () => "/thumb.png"),
  clearUserBlueprintThumbnail: vi.fn(async () => {}),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  cancelBlueprintInstall,
  clearUserBlueprintThumbnail,
  deleteUserBlueprint,
  getBlueprint,
  getOfficialBlueprint,
  installOfficialBlueprint,
  uninstallBlueprint,
  listBlueprints,
  listModelFiles,
  listOfficialBlueprints,
  openModelsDir,
  openUserBlueprintsDir,
  resolveModelUrl,
  saveUserBlueprint,
  setUserBlueprintThumbnail,
} from "./blueprints"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("blueprints host wrappers", () => {
  it("delegates list/get/install/save/thumbnail APIs", async () => {
    await expect(listBlueprints()).resolves.toEqual([{ id: "bp1" }])
    await expect(listOfficialBlueprints()).resolves.toEqual([{ id: "bp1" }])
    expect(commands.listBlueprints).toHaveBeenCalledTimes(2)

    await resolveModelUrl("https://hf.co/x")
    expect(commands.resolveModelUrl).toHaveBeenCalledWith("https://hf.co/x")

    await installOfficialBlueprint("bp1")
    await expect(uninstallBlueprint("bp1")).resolves.toEqual({
      removed: 1,
      kept: 0,
    })
    expect(commands.uninstallBlueprint).toHaveBeenCalledWith("bp1")
    await cancelBlueprintInstall()
    await listModelFiles()
    await openModelsDir()

    await expect(getBlueprint("bp1")).resolves.toMatchObject({ id: "bp1" })
    await expect(getOfficialBlueprint("bp1")).resolves.toMatchObject({
      id: "bp1",
    })
    expect(commands.getBlueprint).toHaveBeenCalledTimes(2)

    const input = { id: "u1", name: "User" } as never
    await saveUserBlueprint(input)
    expect(commands.saveUserBlueprint).toHaveBeenCalledWith(input)
    await deleteUserBlueprint("u1")
    await openUserBlueprintsDir()
    await setUserBlueprintThumbnail("u1", [1, 2], "png")
    expect(commands.setUserBlueprintThumbnail).toHaveBeenCalledWith(
      "u1",
      [1, 2],
      "png"
    )
    await clearUserBlueprintThumbnail("u1")
    expect(commands.clearUserBlueprintThumbnail).toHaveBeenCalledWith("u1")
  })
})
