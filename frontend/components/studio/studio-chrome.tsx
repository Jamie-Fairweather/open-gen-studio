"use client"

import { SettingsIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { BrandMark } from "@/components/brand/brand-mark"
import { JobQueueRail } from "@/components/job-queue-chrome"
import { StudioDialogs } from "@/components/studio/studio-dialogs"
import { useStudioStore } from "@/components/studio/store"
import {
  MEDIA_TABS,
  SETTINGS_TAB,
  UTILITY_TABS,
} from "@/components/studio/studio-tabs"
import { Titlebar } from "@/components/shell"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function StudioChrome({ children }: { children: ReactNode }) {
  const desktop = useStudioStore((s) => s.desktop)
  const studioTab = useStudioStore((s) => s.studioTab)
  const downloadSnapshot = useStudioStore((s) => s.downloadSnapshot)

  if (!desktop) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-8">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Open Gen Studio
        </h1>
        <p className="text-sm text-muted-foreground">
          Local store and host APIs run inside the Tauri desktop shell. Start
          with <code className="font-mono text-xs">bun run desktop</code>.
        </p>
      </div>
    )
  }

  const downloading =
    downloadSnapshot.active != null || downloadSnapshot.queued.length > 0

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
      <Titlebar
        leading={
          <div className="flex items-center gap-2 text-sm font-medium">
            <BrandMark className="size-4" />
            <span className="hidden sm:inline">Open Gen Studio</span>
          </div>
        }
      >
        <nav className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto text-sm [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {MEDIA_TABS.map((tab) => {
            const active = studioTab === tab.id
            return (
              <Link
                key={tab.id}
                href={`/${tab.id}`}
                className={cn(
                  "relative shrink-0 px-2 py-1 transition-colors sm:px-2.5",
                  active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {active ? (
                  <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary sm:inset-x-2.5" />
                ) : null}
              </Link>
            )
          })}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
          <div className="flex shrink-0 items-center gap-0.5">
            {UTILITY_TABS.map((tab) => {
              const active = studioTab === tab.id
              const showDot = tab.id === "downloads" && downloading
              const Icon = tab.icon
              return (
                <WithTooltip key={tab.id} label={tab.label}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className={cn("relative shrink-0", active && "bg-accent")}
                    aria-label={tab.label}
                    aria-current={active ? "page" : undefined}
                    render={<Link href={`/${tab.id}`} />}
                  >
                    <Icon />
                    {showDot ? (
                      <span
                        className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                        aria-label="Download in progress"
                      />
                    ) : null}
                  </Button>
                </WithTooltip>
              )
            })}
            <WithTooltip label={SETTINGS_TAB.label}>
              <Button
                size="icon-sm"
                variant="ghost"
                className={cn(
                  "relative shrink-0",
                  studioTab === SETTINGS_TAB.id && "bg-accent"
                )}
                aria-label={SETTINGS_TAB.label}
                aria-current={
                  studioTab === SETTINGS_TAB.id ? "page" : undefined
                }
                render={<Link href="/settings" />}
              >
                <SettingsIcon />
              </Button>
            </WithTooltip>
          </div>
        </nav>
      </Titlebar>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>

      <JobQueueRail />

      <StudioDialogs />
    </div>
  )
}
