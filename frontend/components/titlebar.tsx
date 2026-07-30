"use client"

import { getCurrentWindow } from "@tauri-apps/api/window"
import { useEffect, useState, type ReactNode } from "react"
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

type TitlebarProps = {
  /** Left end of the bar (e.g. app title). */
  leading?: ReactNode
  /** Centered content (e.g. nav tabs). */
  children?: ReactNode
  /** Right side, just before window controls (e.g. settings). */
  trailing?: ReactNode
}

/** Full-width frameless title bar — same tone as the side rails (`bg-popover`). */
export function Titlebar({ leading, children, trailing }: TitlebarProps) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
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

  const win = () => getCurrentWindow()

  return (
    <div className="relative z-50 grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-border bg-popover">
      <div className="flex min-w-0">
        {leading ? (
          <div className="flex shrink-0 items-center pr-2 pl-3">{leading}</div>
        ) : null}
        <div data-tauri-drag-region className="min-w-0 flex-1" />
      </div>

      <div className="flex min-w-0 items-center px-1">{children}</div>

      <div className="flex min-w-0">
        <div data-tauri-drag-region className="min-w-0 flex-1" />
        {trailing ? (
          <div className="flex shrink-0 items-center pr-1">{trailing}</div>
        ) : null}
        <div className="flex shrink-0">
          <CaptionButton label="Minimize" onClick={() => void win().minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </CaptionButton>
          <CaptionButton
            label={maximized ? "Restore" : "Maximize"}
            onClick={() => void win().toggleMaximize()}
          >
            {maximized ? (
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
