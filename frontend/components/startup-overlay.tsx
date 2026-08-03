"use client"

import { LayersIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

const DURATION_MS = 5000
const EXIT_MS = 350

type Phase = "enter" | "run" | "exit" | "gone"

export function StartupOverlay() {
  const [phase, setPhase] = useState<Phase>("enter")
  const [fill, setFill] = useState(false)
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")

  useEffect(() => {
    const skipExit = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const start = requestAnimationFrame(() => {
      setPhase("run")
      setFill(true)
    })
    const exitAt = window.setTimeout(() => setPhase("exit"), DURATION_MS)
    const goneAt = window.setTimeout(
      () => setPhase("gone"),
      DURATION_MS + (skipExit ? 0 : EXIT_MS)
    )

    return () => {
      cancelAnimationFrame(start)
      window.clearTimeout(exitAt)
      window.clearTimeout(goneAt)
    }
  }, [])

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

        <div className="mt-8 h-1 w-64 overflow-hidden rounded-full bg-white/10 sm:w-72">
          <div
            className="h-full origin-left bg-primary"
            style={{
              width: fill ? "100%" : "0%",
              transition: reducedMotion
                ? undefined
                : `width ${DURATION_MS}ms linear`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
