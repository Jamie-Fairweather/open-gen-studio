/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { setUserLoraThumbnail, clearUserLoraThumbnail, notifySuccess } =
  vi.hoisted(() => ({
    setUserLoraThumbnail: vi.fn(async () => "/lt.png"),
    clearUserLoraThumbnail: vi.fn(async () => {}),
    notifySuccess: vi.fn(),
  }))

vi.mock("@/lib/host", () => ({
  setUserLoraThumbnail: (...a: unknown[]) => setUserLoraThumbnail(...a),
  clearUserLoraThumbnail: (...a: unknown[]) => clearUserLoraThumbnail(...a),
}))
vi.mock("@/lib/notify", () => ({
  notifySuccess: (...a: unknown[]) => notifySuccess(...a),
}))
vi.mock("./creator-thumbnail-field", () => ({
  CreatorThumbnailField: ({
    onPick,
    onClear,
  }: {
    onPick: (p: {
      bytes: number[]
      ext: string
      previewUrl: string
    }) => void | Promise<void>
    onClear: () => void | Promise<void>
  }) => (
    <div>
      <button
        type="button"
        onClick={() =>
          void onPick({ bytes: [1], ext: "png", previewUrl: "blob:n" })
        }
      >
        pick
      </button>
      <button type="button" onClick={() => void onClear()}>
        clear
      </button>
    </div>
  ),
}))

import { RECIPE_ARCHES } from "@/lib/arch"
import { CreatorLoraIdentitySection } from "./creator-lora-identity-section"
import { CreatorLoraVariantsSection } from "./creator-lora-variants-section"

describe("creator lora sections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
  })

  it("identity pick/clear and inputs", async () => {
    const setPendingThumb = vi.fn((fn) =>
      typeof fn === "function"
        ? fn({ bytes: [1], ext: "png", previewUrl: "blob:prev" })
        : fn
    )
    const setThumbnailPath = vi.fn()
    const setName = vi.fn()
    const setIdTouched = vi.fn()
    const setIdManual = vi.fn()

    const { rerender } = render(
      <CreatorLoraIdentitySection
        editing={false}
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={null}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name=""
        setName={setName}
        id=""
        setIdTouched={setIdTouched}
        setIdManual={setIdManual}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    expect(setPendingThumb).toHaveBeenCalled()
    await userEvent.click(screen.getByText("clear"))
    expect(setThumbnailPath).toHaveBeenCalledWith(null)
    fireEvent.change(screen.getByPlaceholderText("Name"), {
      target: { value: "N" },
    })
    fireEvent.change(screen.getByPlaceholderText("Id"), {
      target: { value: "i" },
    })
    expect(setName).toHaveBeenCalledWith("N")
    expect(setIdManual).toHaveBeenCalledWith("i")

    rerender(
      <CreatorLoraIdentitySection
        editing
        editLoraId="l1"
        busy={false}
        loadingEdit={false}
        thumbnailPath="/t.png"
        pendingThumb={{ bytes: [1], ext: "png", previewUrl: "blob:o" }}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name="N"
        setName={setName}
        id="l1"
        setIdTouched={setIdTouched}
        setIdManual={setIdManual}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    await waitFor(() => expect(setUserLoraThumbnail).toHaveBeenCalled())
    await userEvent.click(screen.getByText("clear"))
    await waitFor(() => expect(clearUserLoraThumbnail).toHaveBeenCalled())

    rerender(
      <CreatorLoraIdentitySection
        editing={false}
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={{ bytes: [1], ext: "png", previewUrl: "blob:old" }}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name=""
        setName={setName}
        id=""
        setIdTouched={setIdTouched}
        setIdManual={setIdManual}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    expect(setPendingThumb).toHaveBeenCalled()
    await userEvent.click(screen.getByText("clear"))
    expect(setThumbnailPath).toHaveBeenCalledWith(null)
  })

  it("pick/clear with null pending skips revokeObjectURL", async () => {
    const setPendingThumb = vi.fn((fn) => {
      if (typeof fn === "function") fn(null)
    })
    const setThumbnailPath = vi.fn()
    render(
      <CreatorLoraIdentitySection
        editing={false}
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={null}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name=""
        setName={vi.fn()}
        id=""
        setIdTouched={vi.fn()}
        setIdManual={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText("pick"))
    await userEvent.click(screen.getByText("clear"))
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it("editing clear without saved thumbnail only clears path", async () => {
    const setPendingThumb = vi.fn((fn) => {
      if (typeof fn === "function") fn(null)
    })
    const setThumbnailPath = vi.fn()
    render(
      <CreatorLoraIdentitySection
        editing
        editLoraId="l1"
        busy={false}
        loadingEdit={false}
        thumbnailPath={null}
        pendingThumb={null}
        setPendingThumb={setPendingThumb}
        setThumbnailPath={setThumbnailPath}
        name="N"
        setName={vi.fn()}
        id="l1"
        setIdTouched={vi.fn()}
        setIdManual={vi.fn()}
      />
    )
    await userEvent.click(screen.getByText("clear"))
    expect(clearUserLoraThumbnail).not.toHaveBeenCalled()
    expect(setThumbnailPath).toHaveBeenCalledWith(null)
  })

  it("variants add/remove/paste/blur", async () => {
    let variants = [
      { key: "k1", arch: "z-image", url: "" },
      { key: "k2", arch: "custom-arch", url: "https://x" },
    ]
    const setVariants = vi.fn((fn) => {
      variants = typeof fn === "function" ? fn(variants) : fn
    })
    const updateVariant = vi.fn()
    const tryExpandFromUrl = vi.fn(async () => {})
    render(
      <CreatorLoraVariantsSection
        variants={variants}
        setVariants={setVariants}
        usedArches={new Set(["z-image", "custom-arch"])}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={updateVariant}
        tryExpandFromUrl={tryExpandFromUrl}
      />
    )
    const selects = document.querySelectorAll("select")
    fireEvent.change(selects[0], { target: { value: "flux" } })
    expect(updateVariant).toHaveBeenCalled()
    const url0 = screen.getByPlaceholderText(/CivitAI model/i)
    fireEvent.change(url0, { target: { value: "https://x/a.safetensors" } })
    expect(updateVariant).toHaveBeenCalled()
    fireEvent.paste(url0, {
      clipboardData: { getData: () => "https://civitai.com/models/1" },
    })
    await waitFor(() => expect(tryExpandFromUrl).toHaveBeenCalled())
    fireEvent.paste(url0, {
      clipboardData: {
        getData: () => "https://example.com/direct.safetensors",
      },
    })
    fireEvent.blur(url0)
    expect(tryExpandFromUrl).toHaveBeenCalledTimes(2)
    const url1 = screen.getByPlaceholderText("Download URL")
    fireEvent.change(url1, { target: { value: "https://y/b.safetensors" } })
    fireEvent.paste(url1, {
      clipboardData: { getData: () => "https://civitai.com/models/2" },
    })
    await userEvent.click(
      screen.getAllByRole("button", { name: /Remove architecture/i })[0]
    )
    expect(setVariants).toHaveBeenCalled()
    expect(variants.some((r) => r.key === "k1")).toBe(false)
    await userEvent.click(
      screen.getByRole("button", { name: /Add architecture/i })
    )
    expect(setVariants).toHaveBeenCalled()
    expect(variants).toHaveLength(2)
  })

  it("single row hides remove and caps add at recipe arch count", async () => {
    let variants = [{ key: "only", arch: "z-image", url: "" }]
    const setVariants = vi.fn((fn) => {
      variants = typeof fn === "function" ? fn(variants) : fn
    })
    const { rerender } = render(
      <CreatorLoraVariantsSection
        variants={variants}
        setVariants={setVariants}
        usedArches={new Set(["z-image"])}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    expect(
      screen.queryByRole("button", { name: /Remove architecture/i })
    ).toBeNull()
    await userEvent.click(
      screen.getByRole("button", { name: /Add architecture/i })
    )
    expect(variants).toHaveLength(2)

    variants = RECIPE_ARCHES.map((arch, i) => ({
      key: `k${i}`,
      arch,
      url: "",
    }))
    rerender(
      <CreatorLoraVariantsSection
        variants={variants}
        setVariants={setVariants}
        usedArches={new Set(RECIPE_ARCHES)}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    expect(
      screen.getByRole("button", { name: /Add architecture/i })
    ).toBeDisabled()
  })

  it("add architecture uses first arch when all are used", async () => {
    let variants = [{ key: "only", arch: "z-image", url: "" }]
    const setVariants = vi.fn((fn) => {
      variants = typeof fn === "function" ? fn(variants) : fn
    })
    render(
      <CreatorLoraVariantsSection
        variants={variants}
        setVariants={setVariants}
        usedArches={new Set(RECIPE_ARCHES)}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: /Add architecture/i })
    )
    expect(variants).toHaveLength(2)
    expect(variants[1]?.arch).toBe(RECIPE_ARCHES[0])
  })

  it("falls back to krea2 when no recipe arches remain", async () => {
    vi.resetModules()
    vi.doMock("@/lib/arch", () => ({
      RECIPE_ARCHES: [] as string[],
      isRecipeArch: () => false,
    }))
    const { CreatorLoraVariantsSection: Section } =
      await import("./creator-lora-variants-section")
    let variants = [{ key: "only", arch: "legacy", url: "" }]
    const setVariants = vi.fn((fn) => {
      variants = typeof fn === "function" ? fn(variants) : fn
    })
    render(
      <Section
        variants={variants}
        setVariants={setVariants}
        usedArches={new Set(["legacy"])}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    await userEvent.click(
      screen.getByRole("button", { name: /Add architecture/i })
    )
    expect(variants[1]?.arch).toBe("krea2")
    vi.doUnmock("@/lib/arch")
    vi.resetModules()
  })

  it("shows legacy arch option when row arch is not a recipe arch", () => {
    render(
      <CreatorLoraVariantsSection
        variants={[{ key: "legacy", arch: "legacy-arch", url: "" }]}
        setVariants={vi.fn()}
        usedArches={new Set(["legacy-arch"])}
        busy={false}
        loadingEdit={false}
        expanding={false}
        updateVariant={vi.fn()}
        tryExpandFromUrl={vi.fn()}
      />
    )
    expect(screen.getByRole("option", { name: "legacy-arch" })).toBeTruthy()
  })
})
