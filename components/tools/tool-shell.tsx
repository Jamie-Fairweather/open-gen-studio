"use client"

import { useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Bordered surface - same language as the Tools index list. */
export function ToolSurface({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ToolSurfaceHeader({
  title,
  actions,
}: {
  title: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
      <h2 className="font-heading text-sm font-semibold tracking-tight">
        {title}
      </h2>
      {actions ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

export function ToolFieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

/** Quiet chip row - selected uses border/tint, not solid neon fill. */
export function ToolChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  disabled?: boolean
}) {
  const groupId = useId()
  return (
    <div className="flex flex-col gap-2">
      <ToolFieldLabel>{label}</ToolFieldLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              id={`${groupId}-${opt.id}`}
              onClick={() => onChange(opt.id)}
              className={cn(
                "min-h-9 rounded-lg border px-3 text-sm transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "active:scale-[0.98]",
                selected
                  ? "border-primary/45 bg-primary/12 text-foreground"
                  : "border-border bg-background/50 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground",
                disabled && "opacity-50"
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
