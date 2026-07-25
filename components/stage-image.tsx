"use client"

import { useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

/**
 * Largest box with this aspect that fits a size container (needs container-type: size
 * so both cqi and cqb resolve — inline-size alone breaks portrait).
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

export function StageImage({
  src,
  width,
  height,
  className,
  onLoad,
  overlay,
}: {
  src: string
  width: number
  height: number
  className?: string
  onLoad?: () => void
  /** Hidden preload layer for the next preview frame. */
  overlay?: boolean
}) {
  // Prefer decoded pixels over control/recipe size — wrong stage aspect letterboxes
  // with object-contain and makes wide images look sharp-cornered.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [prevSrc, setPrevSrc] = useState(src)
  if (prevSrc !== src) {
    setPrevSrc(src)
    setNatural(null)
  }
  const frameW = natural?.w ?? width
  const frameH = natural?.h ?? height

  const frame = (
    <div
      className={cn("rounded-3xl drop-shadow-lg", !overlay && className)}
      style={stageFrameStyle(frameW, frameH)}
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
