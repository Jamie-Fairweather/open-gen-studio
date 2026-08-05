import { beforeEach, describe, expect, it, vi } from "vitest"

const commands = vi.hoisted(() => ({
  expandCivitaiLoraUrl: vi.fn(async () => ({ id: "c1" })),
  listLoras: vi.fn(async () => []),
  getLora: vi.fn(async () => ({ id: "l1" })),
  installLoraVariant: vi.fn(async () => {}),
  saveUserLora: vi.fn(async () => ({ id: "u1" })),
  deleteUserLora: vi.fn(async () => {}),
  openUserLorasDir: vi.fn(async () => "/loras"),
  setUserLoraThumbnail: vi.fn(async () => "/t.png"),
  clearUserLoraThumbnail: vi.fn(async () => {}),
}))

vi.mock("@/lib/generated/bindings", () => ({ commands }))

import {
  clearUserLoraThumbnail,
  deleteUserLora,
  expandCivitaiLoraUrl,
  getLora,
  installLoraVariant,
  listLoras,
  openUserLorasDir,
  saveUserLora,
  setUserLoraThumbnail,
} from "./loras"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("loras host wrappers", () => {
  it("delegates expand/list/install/thumbnail APIs", async () => {
    await expandCivitaiLoraUrl("https://civitai.com/models/1")
    await listLoras()
    await getLora("l1")
    await installLoraVariant("l1", "flux")
    expect(commands.installLoraVariant).toHaveBeenCalledWith("l1", "flux")
    const input = { id: "u1", name: "L" } as never
    await saveUserLora(input)
    expect(commands.saveUserLora).toHaveBeenCalledWith(input)
    await deleteUserLora("u1")
    await openUserLorasDir()
    await setUserLoraThumbnail("u1", [9], "jpg")
    expect(commands.setUserLoraThumbnail).toHaveBeenCalledWith("u1", [9], "jpg")
    await clearUserLoraThumbnail("u1")
    expect(commands.clearUserLoraThumbnail).toHaveBeenCalledWith("u1")
  })
})
