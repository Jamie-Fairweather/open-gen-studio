"use client"

import { useState, type CSSProperties, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

/**
 * Largest box with this aspect that fits a size container (needs container-type: size
 * so both cqi and cqb resolve - inline-size alone breaks portrait).
 */
export function stageFrameStyle(width: number, height: number): CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100cqi, calc(100cqb * ${width} / ${height}))`,
    height: `min(100cqb, calc(100cqi * ${height} / ${width}))`,
    maxWidth: "100%",
    maxHeight: "100%",
  }
}

/** Stage photo that prefers decoded natural size over recipe size so object-contain does not letterbox. Overlay mode is a hidden preload. */
export function StageImage({
  src,
  width,
  height,
  className,
  onLoad,
  overlay,
  onOpen,
}: {
  src: string
  width: number
  height: number
  className?: string
  onLoad?: () => void
  /** Hidden preload layer for the next preview frame. */
  overlay?: boolean
  /** Opens fullscreen inspect when the stage image is activated. */
  onOpen?: () => void
}) {
  // Prefer decoded pixels over control/recipe size - wrong stage aspect letterboxes
  // with object-contain and makes wide images look sharp-cornered.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setNatural(null)
  }
  const frameW = natural?.w ?? width
  const frameH = natural?.h ?? height
  const interactive = Boolean(onOpen) && !overlay

  const frame = (
    <div
      className={cn(
        "rounded-3xl drop-shadow-lg",
        interactive &&
          "cursor-zoom-in transition-[filter,transform] duration-200 outline-none hover:brightness-105 focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.992]",
        !overlay && className
      )}
      style={stageFrameStyle(frameW, frameH)}
      {...(interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": "Open fullscreen image",
            onClick: () => onOpen?.(),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onOpen?.()
              }
            },
          }
        : {})}
    >
      <div className="size-full overflow-hidden rounded-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onLoad={(e) => {
            const im = e.currentTarget
            if (im.naturalWidth > 0 && im.naturalHeight > 0) {
              setNatural({ w: im.naturalWidth, h: im.naturalHeight })
            }
            onLoad?.()
          }}
          className="block size-full object-contain"
        />
      </div>
    </div>
  )
  if (overlay) {
    return (
      <div
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center opacity-0",
          className
        )}
      >
        {frame}
      </div>
    )
  }
  return frame
}
