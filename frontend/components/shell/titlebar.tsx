"use client"

import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal, flushSync } from "react-dom"
import { isTauri } from "@/lib/host"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

function CaptionButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

type TitlebarProps = {
  /** Left end of the bar (e.g. app title). */
  leading?: ReactNode
  /** Centered content (e.g. nav tabs). */
  children?: ReactNode
  /** Right side, just before window controls (optional utilities). */
  trailing?: ReactNode
}

/**
 * Full-width frameless title bar — same tone as the side rails (`bg-popover`).
 *
 * Fullscreen follows the known-good frameless Windows pattern (same as Paperling /
 * the workaround for tauri-apps/tauri#11788):
 * - track fullscreen ourselves (`isFullscreen()` is unreliable when undecorated)
 * - unmaximize before entering fullscreen (maximized + fullscreen leaves a taskbar gap)
 * - restore maximize on exit
 * - cover the unavoidable double-resize with an opaque transition dip
 */
export function Titlebar({ leading, children, trailing }: TitlebarProps) {
  const [maximized, setMaximized] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fsCover, setFsCover] = useState<"hidden" | "opaque" | "fading">(
    "hidden"
  )
  const fullscreenRef = useRef(false)
  const wasMaximizedRef = useRef(false)

  useEffect(() => {
    // Store/SSR assume desktop during hydrate; skip until Tauri IPC exists.
    if (!isTauri()) return

    const win = getCurrentWindow()
    let unlisten: (() => void) | undefined

    void win.isMaximized().then(setMaximized)
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized)
      })
      .then((fn) => {
        unlisten = fn
      })

    return () => unlisten?.()
  }, [])

  async function toggleFullscreen() {
    const win = getCurrentWindow()
    const next = !fullscreenRef.current

    try {
      // Instant opaque cover so the unmaximize↔fullscreen reflow isn't visible.
      // flushSync + a frame wait ensures the cover paints before the OS resize.
      flushSync(() => setFsCover("opaque"))
      await waitFrame()

      if (next) {
        wasMaximizedRef.current = await win.isMaximized()
        if (wasMaximizedRef.current) {
          await win.unmaximize()
        }
        await win.setFullscreen(true)
      } else {
        await win.setFullscreen(false)
        if (wasMaximizedRef.current) {
          wasMaximizedRef.current = false
          await win.maximize()
          setMaximized(true)
        }
      }

      fullscreenRef.current = next
      setFullscreen(next)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    } finally {
      // Let the OS settle, then fade the cover out.
      window.setTimeout(() => {
        setFsCover("fading")
        window.setTimeout(() => setFsCover("hidden"), 300)
      }, 200)
    }
  }

  const onToggleFullscreen = useEffectEvent(() => {
    void toggleFullscreen()
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F11") return
      event.preventDefault()
      onToggleFullscreen()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const win = () => getCurrentWindow()

  return (
    <div className="relative z-50 grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-border bg-popover">
      {fsCover !== "hidden" && typeof document !== "undefined"
        ? createPortal(
            <div
              className={cn(
                "pointer-events-none fixed inset-0 z-[99999] bg-background",
                fsCover === "fading" &&
                  "opacity-0 transition-opacity duration-300 ease-out"
              )}
              aria-hidden
            />,
            document.body
          )
        : null}
      <div className="flex min-w-0">
        {leading ? (
          <div className="flex shrink-0 items-center pr-2 pl-3">{leading}</div>
        ) : null}
        <div
          {...(!fullscreen ? { "data-tauri-drag-region": true } : {})}
          className="min-w-0 flex-1"
        />
      </div>

      <div className="flex min-w-0 items-center px-1">{children}</div>

      <div className="flex min-w-0">
        <div
          {...(!fullscreen ? { "data-tauri-drag-region": true } : {})}
          className="min-w-0 flex-1"
        />
        {trailing ? (
          <div className="flex shrink-0 items-center pr-1">{trailing}</div>
        ) : null}
        <div className="flex shrink-0">
          <CaptionButton
            label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d="M1 3h2V1M7 1v2h2M9 7H7v2M3 9V7H1"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d="M1 3V1h2M7 1h2v2M9 7v2H7M3 9H1V7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </CaptionButton>
          <CaptionButton label="Minimize" onClick={() => void win().minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </CaptionButton>
          <CaptionButton
            label={
              fullscreen
                ? "Exit fullscreen"
                : maximized
                  ? "Restore"
                  : "Maximize"
            }
            onClick={() => {
              if (fullscreen) {
                void toggleFullscreen()
                return
              }
              void win().toggleMaximize()
            }}
          >
            {fullscreen || maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <path
                  d="M2.5 3.5h5v5h-5zm1.5-1.5h5v5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                <rect
                  x="1.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </CaptionButton>
          <CaptionButton
            label="Close"
            className="hover:bg-[#e81123] hover:text-white"
            onClick={() => void win().close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M1.5 1.5l7 7M8.5 1.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </CaptionButton>
        </div>
      </div>
    </div>
  )
}
