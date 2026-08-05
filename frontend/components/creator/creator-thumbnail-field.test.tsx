/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const isTauri = vi.fn(() => true)
const notifyError = vi.fn()
const gallerySrc = vi.fn((p: string) => `asset://${p}`)

vi.mock("@/lib/host/runtime", () => ({ isTauri: () => isTauri() }))
vi.mock("@/lib/host", () => ({ gallerySrc: (p: string) => gallerySrc(p) }))
vi.mock("@/lib/notify", () => ({
  notifyError: (...a: unknown[]) => notifyError(...a),
}))

import { CreatorThumbnailField } from "./creator-thumbnail-field"

function file(name: string, type = "image/png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type })
}

describe("CreatorThumbnailField", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isTauri.mockReturnValue(true)
  })

  it("shows empty state and blocks pick when not tauri", async () => {
    isTauri.mockReturnValue(false)
    const onPick = vi.fn()
    const { container } = render(
      <CreatorThumbnailField onPick={onPick} onClear={vi.fn()} />
    )
    expect(screen.getByText("No thumbnail")).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: /Add thumbnail/i })
    )
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file("a.png")] } })
    await waitFor(() => expect(notifyError).toHaveBeenCalled())
    expect(onPick).not.toHaveBeenCalled()
  })

  it("picks file, shows preview, clear error path, jpeg/webp/png ext", async () => {
    const onPick = vi.fn(async () => {})
    const onClear = vi.fn(async () => {
      throw new Error("clear fail")
    })
    const { container, rerender } = render(
      <CreatorThumbnailField
        savedPath="/saved.png?x=1"
        onPick={onPick}
        onClear={onClear}
      />
    )
    expect(gallerySrc).toHaveBeenCalledWith("/saved.png")
    await userEvent.click(screen.getByRole("button", { name: /Replace/i }))
    const input = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [file("shot.jpg", "image/jpeg")] },
    })
    await waitFor(() => expect(onPick).toHaveBeenCalled())
    expect(onPick.mock.calls[0][0].ext).toBe("jpg")

    fireEvent.change(input, { target: { files: [file("w", "image/webp")] } })
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(2))
    expect(onPick.mock.calls[1][0].ext).toBe("webp")

    fireEvent.change(input, { target: { files: [file("x", "image/png")] } })
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(3))
    expect(onPick.mock.calls[2][0].ext).toBe("png")

    onPick.mockRejectedValueOnce(new Error("pick fail"))
    fireEvent.change(input, { target: { files: [file("b.png")] } })
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("pick fail", "Thumbnail")
    )

    rerender(
      <CreatorThumbnailField
        pending={{ bytes: [1], ext: "png", previewUrl: "blob:preview" }}
        onPick={onPick}
        onClear={onClear}
      />
    )
    await userEvent.click(screen.getByRole("button", { name: /Remove/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("clear fail", "Thumbnail")
    )

    fireEvent.change(input, {
      target: { files: [file("photo.jpeg", "image/jpeg")] },
    })
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(5))
    expect(onPick.mock.calls[4][0].ext).toBe("jpeg")

    const noDot = file("nodot", "image/jpeg")
    Object.defineProperty(noDot, "type", { value: "image/jpeg" })
    fireEvent.change(input, { target: { files: [noDot] } })
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(6))
    expect(onPick.mock.calls[5][0].ext).toBe("jpg")

    fireEvent.change(input, { target: { files: null } })
    expect(onPick).toHaveBeenCalledTimes(6)

    fireEvent.change(input, { target: { files: [file("dot.", "image/png")] } })
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(7))
    expect(onPick.mock.calls[6][0].ext).toBe("png")

    onClear.mockRejectedValueOnce("plain")
    await userEvent.click(screen.getByRole("button", { name: /Remove/i }))
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith("plain", "Thumbnail")
    )

    rerender(
      <CreatorThumbnailField
        savedPath="thumb.png"
        onPick={onPick}
        onClear={vi.fn()}
      />
    )
    expect(gallerySrc).toHaveBeenCalledWith("thumb.png")
  })
})
