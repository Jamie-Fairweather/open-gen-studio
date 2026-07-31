"use client"

import * as React from "react"
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu"
import { commands } from "@/lib/generated/bindings"

type TextField = HTMLInputElement | HTMLTextAreaElement

type WordRange = {
  start: number
  end: number
  word: string
}

type MenuState = {
  x: number
  y: number
  field: TextField
  range: WordRange | null
  suggestions: string[]
  canCutCopy: boolean
}

function isEditableTarget(target: EventTarget | null): TextField | null {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  if (target instanceof HTMLTextAreaElement) {
    return target
  }

  if (target instanceof HTMLInputElement) {
    const type = target.type
    if (
      [
        "button",
        "checkbox",
        "color",
        "file",
        "hidden",
        "image",
        "radio",
        "range",
        "reset",
        "submit",
      ].includes(type)
    ) {
      return null
    }
    return target
  }

  const nested = target.closest("textarea, input")
  if (
    nested instanceof HTMLTextAreaElement ||
    nested instanceof HTMLInputElement
  ) {
    return isEditableTarget(nested)
  }

  return null
}

function wordAtCaret(field: TextField): WordRange | null {
  const value = field.value
  if (!value) {
    return null
  }

  let start = field.selectionStart ?? 0
  let end = field.selectionEnd ?? start

  if (start !== end) {
    const word = value.slice(start, end).trim()
    if (word) {
      // Expand to full word if selection is mid-token.
      while (start > 0 && /[^\s.,;:!?()[\]{}"'`…]/.test(value[start - 1]!)) {
        start -= 1
      }
      while (end < value.length && /[^\s.,;:!?()[\]{}"'`…]/.test(value[end]!)) {
        end += 1
      }
      return { start, end, word: value.slice(start, end) }
    }
  }

  // If caret sits on whitespace after a word (common after typing), step back.
  if (
    start > 0 &&
    /\s/.test(value[start] ?? " ") &&
    /[^\s]/.test(value[start - 1]!)
  ) {
    start -= 1
  }

  while (start > 0 && /[^\s.,;:!?()[\]{}"'`…]/.test(value[start - 1]!)) {
    start -= 1
  }
  end = start
  while (end < value.length && /[^\s.,;:!?()[\]{}"'`…]/.test(value[end]!)) {
    end += 1
  }

  const word = value.slice(start, end)
  if (!word) {
    return null
  }
  return { start, end, word }
}

function setFieldValue(field: TextField, next: string, caret: number) {
  const proto =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
  descriptor?.set?.call(field, next)
  field.dispatchEvent(new Event("input", { bubbles: true }))
  field.setSelectionRange(caret, caret)
  field.focus()
}

function replaceWord(field: TextField, range: WordRange, suggestion: string) {
  const next =
    field.value.slice(0, range.start) +
    suggestion +
    field.value.slice(range.end)
  setFieldValue(field, next, range.start + suggestion.length)
}

async function insertClipboard(field: TextField) {
  try {
    const text = await navigator.clipboard.readText()
    const start = field.selectionStart ?? 0
    const end = field.selectionEnd ?? start
    const next = field.value.slice(0, start) + text + field.value.slice(end)
    setFieldValue(field, next, start + text.length)
  } catch {
    // Permission denied / unavailable — ignore.
  }
}

/** Strip native browser chrome; editable fields get a coss context menu. */
function NativeChrome() {
  const [menu, setMenu] = React.useState<MenuState | null>(null)
  const requestIdRef = React.useRef(0)

  React.useEffect(() => {
    function onContextMenu(event: MouseEvent) {
      event.preventDefault()

      const field = isEditableTarget(event.target)
      if (!field || field.disabled || field.readOnly) {
        setMenu(null)
        return
      }

      field.focus()
      const range = wordAtCaret(field)
      const canCutCopy =
        (field.selectionStart ?? 0) !== (field.selectionEnd ?? 0)
      const requestId = ++requestIdRef.current

      setMenu({
        x: event.clientX,
        y: event.clientY,
        field,
        range,
        suggestions: [],
        canCutCopy,
      })

      const word = range?.word
      if (
        !word ||
        (field instanceof HTMLInputElement && field.type === "password")
      ) {
        return
      }

      void commands
        .spellcheckSuggestions(word)
        .then((suggestions) => {
          if (requestIdRef.current !== requestId) {
            return
          }
          setMenu((current) =>
            current && current.range?.word === word
              ? { ...current, suggestions }
              : current
          )
        })
        .catch((error: unknown) => {
          console.warn("[spellcheck]", error)
        })
    }

    function onDragStart(event: DragEvent) {
      if (isEditableTarget(event.target)) {
        return
      }
      event.preventDefault()
    }

    document.addEventListener("contextmenu", onContextMenu)
    document.addEventListener("dragstart", onDragStart)

    return () => {
      document.removeEventListener("contextmenu", onContextMenu)
      document.removeEventListener("dragstart", onDragStart)
    }
  }, [])

  // Keep ContextMenu unmounted while idle — Base UI menu roots are not free.
  if (!menu) {
    return null
  }

  const anchor = {
    getBoundingClientRect: () =>
      DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }),
  }

  return (
    <ContextMenu
      open
      onOpenChange={(next) => {
        if (!next) {
          setMenu(null)
        }
      }}
    >
      <ContextMenuPopup
        align="start"
        anchor={anchor}
        side="bottom"
        sideOffset={4}
      >
        {menu.suggestions.map((suggestion) => (
          <ContextMenuItem
            key={suggestion}
            closeOnClick
            onClick={() => {
              if (menu.range) {
                replaceWord(menu.field, menu.range, suggestion)
              }
            }}
          >
            {suggestion}
          </ContextMenuItem>
        ))}
        {menu.suggestions.length > 0 ? <ContextMenuSeparator /> : null}
        <ContextMenuItem
          closeOnClick
          disabled={!menu.canCutCopy}
          onClick={() => {
            menu.field.focus()
            document.execCommand("cut")
          }}
        >
          Cut
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          closeOnClick
          disabled={!menu.canCutCopy}
          onClick={() => {
            menu.field.focus()
            document.execCommand("copy")
          }}
        >
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          closeOnClick
          onClick={() => {
            void insertClipboard(menu.field)
          }}
        >
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuPopup>
    </ContextMenu>
  )
}

export { NativeChrome }
