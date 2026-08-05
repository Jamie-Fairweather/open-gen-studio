/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const spellcheckSuggestions = vi.hoisted(() =>
  vi.fn(async (_word: string) => ["fixed"])
)
const readText = vi.hoisted(() => vi.fn(async () => "clip"))

vi.mock("@/lib/generated/bindings", () => ({
  commands: { spellcheckSuggestions },
}))

import { NativeChrome } from "./native-chrome"

function fireContext(el: EventTarget | null, x = 10, y = 20) {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  })
  Object.defineProperty(event, "target", { configurable: true, value: el })
  document.dispatchEvent(event)
}

describe("NativeChrome", () => {
  beforeEach(() => {
    spellcheckSuggestions.mockReset().mockResolvedValue(["fixed"])
    readText.mockReset().mockResolvedValue("clip")
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    })
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: vi.fn(() => true),
    })
  })

  it("ignores non-editable targets and restricted inputs", () => {
    render(
      <>
        <NativeChrome />
        <div data-testid="div">x</div>
        <input data-testid="file" type="file" />
        <input data-testid="checkbox" type="checkbox" />
        <input data-testid="ro" readOnly defaultValue="ro" />
        <input data-testid="dis" disabled defaultValue="d" />
      </>
    )

    fireContext(screen.getByTestId("div"))
    expect(screen.queryByText("Paste")).toBeNull()
    fireContext(screen.getByTestId("file"))
    expect(screen.queryByText("Paste")).toBeNull()
    fireContext(screen.getByTestId("checkbox"))
    expect(screen.queryByText("Paste")).toBeNull()
    fireContext(screen.getByTestId("ro"))
    expect(screen.queryByText("Paste")).toBeNull()
    fireContext(screen.getByTestId("dis"))
    expect(screen.queryByText("Paste")).toBeNull()
    fireContext(null as unknown as EventTarget)
    expect(screen.queryByText("Paste")).toBeNull()
  })

  it("opens menu on text fields with suggestions, cut/copy", async () => {
    const user = userEvent.setup()
    render(
      <>
        <NativeChrome />
        <input data-testid="text" defaultValue="helo world" />
        <textarea data-testid="area" defaultValue="helo" />
        <input data-testid="pw" type="password" defaultValue="secret" />
      </>
    )

    const input = screen.getByTestId("text") as HTMLInputElement
    input.focus()
    input.setSelectionRange(0, 4)
    fireContext(input)
    expect(await screen.findByText("Paste")).toBeInTheDocument()
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("helo")
    )
    await user.click(await screen.findByText("fixed"))
    expect(input.value).toBe("fixed world")

    // stale suggestion request ignored when word changes
    let resolveSpell!: (v: string[]) => void
    spellcheckSuggestions.mockImplementationOnce(
      () =>
        new Promise<string[]>((r) => {
          resolveSpell = r
        })
    )
    input.value = "first"
    input.setSelectionRange(0, 5)
    fireContext(input)
    input.value = "second"
    input.setSelectionRange(0, 6)
    spellcheckSuggestions.mockResolvedValueOnce(["other"])
    fireContext(input)
    resolveSpell(["stale"])
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("second")
    )

    spellcheckSuggestions.mockClear()
    const pw = screen.getByTestId("pw") as HTMLInputElement
    pw.focus()
    pw.setSelectionRange(0, 3)
    fireContext(pw)
    await screen.findByRole("menuitem", { name: /^Paste/i })
    expect(spellcheckSuggestions).not.toHaveBeenCalled()

    const area = screen.getByTestId("area") as HTMLTextAreaElement
    area.value = "alpha beta"
    area.focus()
    area.setSelectionRange(1, 3)
    fireContext(area)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("alpha")
    )

    area.setSelectionRange(5, 5)
    fireContext(area)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("alpha")
    )

    area.value = "   "
    area.setSelectionRange(1, 1)
    fireContext(area)
    await screen.findByRole("menuitem", { name: /^Paste/i })

    area.value = ""
    area.setSelectionRange(0, 0)
    fireContext(area)
    await screen.findByRole("menuitem", { name: /^Paste/i })

    // whitespace-only selection falls through
    area.value = "  hi"
    area.setSelectionRange(0, 2)
    fireContext(area)
    await screen.findByRole("menuitem", { name: /^Paste/i })

    area.value = "abc"
    area.setSelectionRange(0, 3)
    fireContext(area)
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Cut/i }))
    expect(document.execCommand).toHaveBeenCalledWith("cut")

    area.setSelectionRange(0, 3)
    fireContext(area)
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Copy/i }))
    expect(document.execCommand).toHaveBeenCalledWith("copy")
  })

  it("resolves nested editable via closest()", async () => {
    render(
      <>
        <NativeChrome />
        <input data-testid="text" defaultValue="word" />
      </>
    )
    const input = screen.getByTestId("text") as HTMLInputElement
    const proxy = document.createElement("span")
    proxy.closest = ((sel: string) =>
      input.matches(sel) || input.matches(sel.split(",")[0]!.trim())
        ? input
        : null) as typeof proxy.closest
    // Prefer exact closest behavior used by the source
    proxy.closest = ((selector: string) => {
      if (selector.includes("input") || selector.includes("textarea")) {
        return input
      }
      return null
    }) as typeof proxy.closest

    input.focus()
    input.setSelectionRange(0, 4)
    fireContext(proxy)
    expect(
      await screen.findByRole("menuitem", { name: /^Paste/i })
    ).toBeTruthy()
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("word")
    )
  })

  it("pastes clipboard text and swallows clipboard errors", async () => {
    render(
      <>
        <NativeChrome />
        <input data-testid="text" defaultValue="ab" />
      </>
    )
    const input = screen.getByTestId("text") as HTMLInputElement
    input.focus()
    input.setSelectionRange(1, 1)
    fireContext(input)
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Paste/i }))
    await waitFor(() => expect(readText).toHaveBeenCalled())
    await waitFor(() => expect(input.value).toBe("aclipb"))

    readText.mockRejectedValueOnce(new Error("denied"))
    input.setSelectionRange(1, 1)
    fireContext(input)
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Paste/i }))
    await waitFor(() => expect(readText).toHaveBeenCalledTimes(2))
  })

  it("handles spellcheck failure, dragstart, and menu dismiss", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    spellcheckSuggestions.mockRejectedValueOnce(new Error("nope"))

    render(
      <>
        <NativeChrome />
        <input data-testid="text" defaultValue="typo" />
        <div data-testid="drag">drag</div>
      </>
    )

    const input = screen.getByTestId("text") as HTMLInputElement
    input.focus()
    input.setSelectionRange(0, 4)
    fireContext(input)
    await waitFor(() => expect(warn).toHaveBeenCalled())

    const drag = new Event("dragstart", { bubbles: true, cancelable: true })
    screen.getByTestId("drag").dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)

    const okDrag = new Event("dragstart", { bubbles: true, cancelable: true })
    input.dispatchEvent(okDrag)
    expect(okDrag.defaultPrevented).toBe(false)

    fireContext(input)
    await screen.findByRole("menuitem", { name: /^Paste/i })
    // dismiss via onOpenChange(false)
    fireEvent.click(document.body)
  })

  it("covers selection expansion, caret on whitespace, and suggestion mismatch", async () => {
    render(
      <>
        <NativeChrome />
        <textarea data-testid="area" defaultValue="hello world" />
        <input data-testid="text" defaultValue="ab" />
      </>
    )

    const area = screen.getByTestId("area") as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(1, 4)
    fireContext(area)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("hello")
    )

    area.value = "word next"
    area.focus()
    area.setSelectionRange(4, 5)
    fireContext(area)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("word")
    )

    spellcheckSuggestions.mockResolvedValueOnce(["other"])
    area.value = "typo"
    area.focus()
    area.setSelectionRange(0, 4)
    fireContext(area)
    area.value = "changed"
    area.setSelectionRange(0, 7)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("typo")
    )
    await screen.findByRole("menuitem", { name: "other" })

    const input = screen.getByTestId("text") as HTMLInputElement
    input.focus()
    input.setSelectionRange(1, 1)
    fireContext(input)
    const cut = await screen.findByRole("menuitem", { name: /^Cut/i })
    expect(cut).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Paste/i }))
  })

  it("uses null selection indices and textarea suggestion replace", async () => {
    render(
      <>
        <NativeChrome />
        <input data-testid="text" defaultValue="ab" />
        <textarea data-testid="area" defaultValue="fixme" />
      </>
    )

    const input = screen.getByTestId("text") as HTMLInputElement
    Object.defineProperty(input, "selectionStart", {
      configurable: true,
      get: () => null,
    })
    Object.defineProperty(input, "selectionEnd", {
      configurable: true,
      get: () => null,
    })
    input.focus()
    fireContext(input)
    await screen.findByRole("menuitem", { name: /^Paste/i })

    const area = screen.getByTestId("area") as HTMLTextAreaElement
    area.focus()
    area.setSelectionRange(0, 5)
    fireContext(area)
    await waitFor(() =>
      expect(spellcheckSuggestions).toHaveBeenCalledWith("fixme")
    )
    fireEvent.click(await screen.findByRole("menuitem", { name: "fixed" }))
    expect(area.value).toBe("fixed")
  })
})
