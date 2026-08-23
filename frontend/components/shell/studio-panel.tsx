"use client"

import type { ReactNode } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/** Shared content width for Creator / Downloads style panels. */
export const STUDIO_PANEL_MAX = "max-w-2xl"
/** Horizontal page gutters for panel chrome and body. */
export const STUDIO_PANEL_GUTTER = "px-5 md:px-8"

type StudioPanelProps = {
  children: ReactNode
  className?: string
}

/** Full-height column shell for Creator/Downloads-style pages. */
export function StudioPanel({ children, className }: StudioPanelProps) {
  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col", className)}>
      {children}
    </div>
  )
}

type StudioPanelHeaderProps = {
  title: string
  description?: ReactNode
  action?: ReactNode
}

/** Title/description row locked to the shared panel gutters and max-width. */
export function StudioPanelHeader({
  title,
  description,
  action,
}: StudioPanelHeaderProps) {
  return (
    <header
      className={cn(
        "shrink-0 border-b border-border/60 py-3",
        STUDIO_PANEL_GUTTER
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full items-center justify-between gap-3",
          STUDIO_PANEL_MAX
        )}
      >
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-semibold tracking-tight uppercase md:text-xl">
            {title}
          </h1>
          {description != null && description !== "" ? (
            <p className="text-[11px] text-muted-foreground sm:text-xs">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </header>
  )
}

type StudioPanelColumnProps = {
  children: ReactNode
  className?: string
}

/** Centers children at STUDIO_PANEL_MAX. */
export function StudioPanelColumn({
  children,
  className,
}: StudioPanelColumnProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col",
        STUDIO_PANEL_MAX,
        className
      )}
    >
      {children}
    </div>
  )
}

type StudioPanelBodyProps = {
  children: ReactNode
  className?: string
}

/** Scrollable body with standard gutters + max-width column. */
export function StudioPanelBody({ children, className }: StudioPanelBodyProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <ScrollArea className="h-full" scrollFade>
        <div
          className={cn("flex min-h-full flex-col py-4", STUDIO_PANEL_GUTTER)}
        >
          <StudioPanelColumn className={cn("flex-1", className)}>
            {children}
          </StudioPanelColumn>
        </div>
      </ScrollArea>
    </div>
  )
}

type StudioPanelFooterProps = {
  children: ReactNode
  className?: string
}

/** Sticky footer that reuses the shared gutters and max-width column. */
export function StudioPanelFooter({
  children,
  className,
}: StudioPanelFooterProps) {
  return (
    <footer
      className={cn(
        "shrink-0 border-t border-border/60 bg-background/95 py-2.5",
        STUDIO_PANEL_GUTTER,
        className
      )}
    >
      <StudioPanelColumn className="flex-row items-center justify-between gap-3">
        {children}
      </StudioPanelColumn>
    </footer>
  )
}
