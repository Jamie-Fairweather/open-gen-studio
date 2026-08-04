"use client"

import { LayersIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useStudioStore } from "@/components/studio/store"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

const MIN_MS = 500
/** Safety only — normally dismisses when session/catalog hydrate finishes. */
const SAFETY_MS = 20_000
const EXIT_MS = 350

type Phase = "enter" | "run" | "exit" | "gone"

export function StartupOverlay() {
  const [phase, setPhase] = useState<Phase>("enter")
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const startupHydrated = useStudioStore((s) => s.startupHydrated)
  const dismissRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const skipExit = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const startedAt = performance.now()
    let dismissed = false
    let exitAt = 0
    let goneAt = 0

    const start = requestAnimationFrame(() => {
      setPhase("run")
    })

    const dismiss = () => {
      if (dismissed) return
      dismissed = true
      const elapsed = performance.now() - startedAt
      const wait = Math.max(0, MIN_MS - elapsed)
      exitAt = window.setTimeout(() => setPhase("exit"), wait)
      goneAt = window.setTimeout(
        () => setPhase("gone"),
        wait + (skipExit ? 0 : EXIT_MS)
      )
    }
    dismissRef.current = dismiss

    const safetyAt = window.setTimeout(dismiss, SAFETY_MS)

    return () => {
      dismissRef.current = null
      cancelAnimationFrame(start)
      window.clearTimeout(safetyAt)
      window.clearTimeout(exitAt)
      window.clearTimeout(goneAt)
    }
  }, [])

  useEffect(() => {
    if (startupHydrated) dismissRef.current?.()
  }, [startupHydrated])

  if (phase === "gone") return null

  return (
    <div
      className={cn(
        "fixed inset-0 z-100 flex flex-col items-center justify-center bg-background",
        !reducedMotion && "transition-opacity duration-300 ease-out",
        phase === "exit" && "opacity-0"
      )}
      aria-busy="true"
      aria-live="polite"
      aria-label="Open Gen Studio is starting"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_48%,#141416_0%,transparent_70%)]"
      />

      <div
        className={cn(
          "relative flex flex-col items-center",
          !reducedMotion &&
            "transition-[opacity,transform] duration-500 ease-out",
          phase === "enter"
            ? "translate-y-1.5 opacity-0"
            : "translate-y-0 opacity-100"
        )}
      >
        <div className="mb-7 flex size-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-[0_0_40px_-12px] shadow-primary/40">
          <LayersIcon className="size-7 text-primary" aria-hidden />
        </div>

        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground uppercase sm:text-4xl">
          Open Gen Studio
        </h1>

        <p className="mt-3 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Starting
        </p>
      </div>
    </div>
  )
}
