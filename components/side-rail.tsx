"use client"

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export const SIDE_RAIL_BG = "bg-popover"
export const SIDE_RAIL_WIDTH = "min(20rem, 40vw)"

type SideRailProps = {
  open: boolean
  side: "left" | "right"
  width?: string
  children: ReactNode
  className?: string
}

export function SideRail({
  open,
  side,
  width = SIDE_RAIL_WIDTH,
  children,
  className,
}: SideRailProps) {
  return (
    <aside
      className={cn(
        "absolute inset-y-0 z-20 flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-out",
        SIDE_RAIL_BG,
        side === "left"
          ? "left-0 border-r border-border"
          : "right-0 border-l border-border",
        open
          ? "translate-x-0"
          : side === "left"
            ? "pointer-events-none -translate-x-full"
            : "pointer-events-none translate-x-full",
        className
      )}
      style={{ width }}
      aria-hidden={!open}
    >
      {children}
    </aside>
  )
}

export function SideRailHeader({
  title,
  count,
}: {
  title: string
  count?: number
}) {
  const label = count != null ? `${title} • ${count}` : title
  return (
    <div className="relative shrink-0 px-4 pt-4 pb-3">
      <p className="text-center text-sm font-medium tracking-tight text-foreground">
        {label}
      </p>
      <div
        aria-hidden
        className="mt-3 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />
    </div>
  )
}

export function SideRailBody({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <ScrollArea className="h-full" scrollbarGutter>
        <div className="flex flex-col gap-4 px-3.5 pb-5">{children}</div>
      </ScrollArea>
    </div>
  )
}

type SideRailHandleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  side: "left" | "right"
  open: boolean
  offset: string
  icon: ReactNode
  count?: number
}

export function SideRailHandle({
  side,
  open,
  offset,
  icon,
  count,
  className,
  style,
  children,
  ...props
}: SideRailHandleProps) {
  const edgeStyle: CSSProperties =
    side === "left"
      ? { left: open ? offset : 0, ...style }
      : { right: open ? offset : 0, ...style }

  return (
    <button
      type="button"
      className={cn(
        "absolute top-1/2 z-30 flex h-20 w-9 -translate-y-1/2 flex-col items-center justify-center gap-1.5 border border-border bg-card py-2.5 text-muted-foreground shadow-xl transition-[left,right,colors] duration-300 hover:bg-muted hover:text-foreground",
        side === "left"
          ? open
            ? "rounded-l-none rounded-r-xl border-l-0"
            : "rounded-r-xl border-l-0"
          : open
            ? "rounded-l-xl rounded-r-none border-r-0"
            : "rounded-l-xl border-r-0",
        className
      )}
      style={edgeStyle}
      {...props}
    >
      {icon}
      {children}
      {count != null ? (
        <span className="font-mono text-[10px] font-medium text-primary tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  )
}
