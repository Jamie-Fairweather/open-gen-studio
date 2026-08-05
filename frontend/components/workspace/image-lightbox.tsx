"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  ImageIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** View zoom: 1 = fit-to-viewport. Pixel % = fitScale * viewZoom * 100. */
const MIN_VIEW_ZOOM = 1
/** Cap at 800% of native image pixels. */
const MAX_PIXEL_ZOOM = 8
const PIXEL_ZOOM_FACTOR = 1.12

type ImageLightboxProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string | null
  alt?: string
  onImageToPrompt?: () => void
}

type Size = { w: number; h: number }

function fitScaleFor(viewport: Size, natural: Size): number {
  if (natural.w <= 0 || natural.h <= 0 || viewport.w <= 0 || viewport.h <= 0) {
    return 1
  }
  // Same as max-w/h-full object-contain: never upscales past 1:1 CSS pixels.
  return Math.min(1, viewport.w / natural.w, viewport.h / natural.h)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function ImageLightbox({
  open,
  onOpenChange,
  src,
  alt = "Generated image",
  onImageToPrompt,
}: ImageLightboxProps) {
  // viewZoom 1 = fitted; pixelZoom = fitScale * viewZoom
  const [viewZoom, setViewZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState<Size | null>(null)
  const [viewportSize, setViewportSize] = useState<Size>({ w: 0, h: 0 })
  const [dragging, setDragging] = useState(false)

  const viewZoomRef = useRef(viewZoom)
  const panRef = useRef(pan)
  const naturalRef = useRef(natural)
  const viewportSizeRef = useRef(viewportSize)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    viewZoomRef.current = viewZoom
  }, [viewZoom])
  useEffect(() => {
    panRef.current = pan
  }, [pan])
  useEffect(() => {
    naturalRef.current = natural
  }, [natural])
  useEffect(() => {
    viewportSizeRef.current = viewportSize
  }, [viewportSize])

  const measureViewport = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const next = { w: el.clientWidth, h: el.clientHeight }
    setViewportSize(next)
    viewportSizeRef.current = next
  }, [])

  useEffect(() => {
    if (!open) return
    measureViewport()
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => measureViewport())
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, measureViewport, src])

  const fitScale = natural ? fitScaleFor(viewportSize, natural) : 1
  const maxViewZoom = MAX_PIXEL_ZOOM / Math.max(fitScale, 0.0001)

  const pixelZoom = fitScale * viewZoom
  const zoomLabel = `${Math.round(pixelZoom * 100)}%`

  function resetView() {
    setViewZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function setViewZoomAround(
    nextViewZoom: number,
    clientX: number,
    clientY: number
  ) {
    const viewport = viewportRef.current
    const nat = naturalRef.current
    const vp = viewportSizeRef.current
    const fs = nat ? fitScaleFor(vp, nat) : 1
    const maxZ = MAX_PIXEL_ZOOM / Math.max(fs, 0.0001)
    const prevZ = viewZoomRef.current
    const z = clamp(nextViewZoom, MIN_VIEW_ZOOM, maxZ)

    if (!viewport || z <= MIN_VIEW_ZOOM) {
      setViewZoom(z)
      setPan({ x: 0, y: 0 })
      return
    }

    const rect = viewport.getBoundingClientRect()
    const cx = clientX - rect.left - rect.width / 2
    const cy = clientY - rect.top - rect.height / 2
    const prev = panRef.current
    const scale = z / prevZ
    setViewZoom(z)
    setPan({
      x: cx - (cx - prev.x) * scale,
      y: cy - (cy - prev.y) * scale,
    })
  }

  function nudgePixelZoom(direction: 1 | -1) {
    const viewport = viewportRef.current
    const nat = naturalRef.current
    const vp = viewportSizeRef.current
    const fs = nat ? fitScaleFor(vp, nat) : 1
    const factor = direction > 0 ? PIXEL_ZOOM_FACTOR : 1 / PIXEL_ZOOM_FACTOR
    const nextPixel = clamp(
      fs * viewZoomRef.current * factor,
      fs * MIN_VIEW_ZOOM,
      MAX_PIXEL_ZOOM
    )
    const nextView = nextPixel / Math.max(fs, 0.0001)
    if (!viewport?.isConnected) {
      setViewZoom(nextView)
      if (nextView <= MIN_VIEW_ZOOM) setPan({ x: 0, y: 0 })
      return
    }
    const rect = viewport.getBoundingClientRect()
    setViewZoomAround(
      nextView,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    )
  }

  // Capture wheel on the document while open so portal timing / focus can't miss it.
  useEffect(() => {
    if (!open) return
    const onWheel = (e: WheelEvent) => {
      const root = document.querySelector('[data-slot="image-lightbox"]')
      if (!root || !(e.target instanceof Node) || !root.contains(e.target)) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const direction: 1 | -1 = e.deltaY < 0 ? 1 : -1
      const nat = naturalRef.current
      const vp = viewportSizeRef.current
      const fs = nat ? fitScaleFor(vp, nat) : 1
      const factor = direction > 0 ? PIXEL_ZOOM_FACTOR : 1 / PIXEL_ZOOM_FACTOR
      const nextPixel = clamp(
        fs * viewZoomRef.current * factor,
        fs * MIN_VIEW_ZOOM,
        MAX_PIXEL_ZOOM
      )
      const nextView = nextPixel / Math.max(fs, 0.0001)
      setViewZoomAround(nextView, e.clientX, e.clientY)
    }
    document.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    })
    return () =>
      document.removeEventListener("wheel", onWheel, { capture: true })
  }, [open])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (viewZoomRef.current <= MIN_VIEW_ZOOM || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
    }
    setDragging(true)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setPan({
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    })
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
  }

  function onDoubleClick(e: ReactPointerEvent<HTMLDivElement>) {
    const nat = naturalRef.current
    const vp = viewportSizeRef.current
    const fs = nat ? fitScaleFor(vp, nat) : 1
    // Toggle fit <-> 100% native pixels.
    if (viewZoomRef.current > MIN_VIEW_ZOOM + 0.001) {
      resetView()
      return
    }
    const oneToOne = 1 / Math.max(fs, 0.0001)
    setViewZoomAround(oneToOne, e.clientX, e.clientY)
  }

  if (!src) return null

  const canPan = viewZoom > MIN_VIEW_ZOOM
  const atFit = viewZoom <= MIN_VIEW_ZOOM + 0.001 && pan.x === 0 && pan.y === 0
  const atMaxPixel = pixelZoom >= MAX_PIXEL_ZOOM - 0.001

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className="fixed inset-0 z-50 bg-black/92 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm"
          data-slot="image-lightbox-backdrop"
        />
        <DialogPrimitive.Popup
          className="fixed inset-0 z-50 flex outline-none"
          data-slot="image-lightbox"
        >
          <DialogPrimitive.Title className="sr-only">
            Image viewer
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Scroll to zoom by image pixels, drag to pan when zoomed. Escape or
            Close to exit.
          </DialogPrimitive.Description>

          <div
            ref={viewportRef}
            className={cn(
              "relative flex size-full items-center justify-center overflow-hidden",
              canPan
                ? dragging
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-zoom-in"
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={onDoubleClick}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              draggable={false}
              onLoad={(e) => {
                const im = e.currentTarget
                if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                  const size = { w: im.naturalWidth, h: im.naturalHeight }
                  setNatural(size)
                  naturalRef.current = size
                  measureViewport()
                }
              }}
              className={cn(
                "max-h-full max-w-full object-contain will-change-transform select-none",
                !dragging &&
                  "motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
              )}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${viewZoom})`,
              }}
            />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-end p-3 sm:p-4">
            <WithTooltip label="Close (Esc)">
              <DialogPrimitive.Close
                render={
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="pointer-events-auto size-10 rounded-full border border-border/60 bg-card/80 shadow-lg backdrop-blur-md"
                    aria-label="Close image viewer"
                  />
                }
              >
                <XIcon className="size-4" />
              </DialogPrimitive.Close>
            </WithTooltip>
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-5">
            <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-card/85 p-1 shadow-lg backdrop-blur-md">
              {onImageToPrompt ? (
                <WithTooltip label="Image to Prompt">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="size-9 rounded-full"
                    aria-label="Image to Prompt"
                    onClick={() => {
                      onImageToPrompt()
                      onOpenChange(false)
                    }}
                  >
                    <ImageIcon className="size-4" />
                  </Button>
                </WithTooltip>
              ) : null}
              <WithTooltip label="Zoom out">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-9 rounded-full"
                  aria-label="Zoom out"
                  disabled={atFit}
                  onClick={() => nudgePixelZoom(-1)}
                >
                  <MinusIcon className="size-4" />
                </Button>
              </WithTooltip>
              <WithTooltip label="Zoom relative to image pixels (100% = 1:1)">
                <span className="min-w-14 px-1 text-center font-mono text-xs text-foreground tabular-nums">
                  {zoomLabel}
                </span>
              </WithTooltip>
              <WithTooltip label="Zoom in">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-9 rounded-full"
                  aria-label="Zoom in"
                  disabled={atMaxPixel || viewZoom >= maxViewZoom - 0.001}
                  onClick={() => nudgePixelZoom(1)}
                >
                  <PlusIcon className="size-4" />
                </Button>
              </WithTooltip>
              <WithTooltip label="Fit to screen">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-9 rounded-full"
                  aria-label="Fit to screen"
                  disabled={atFit}
                  onClick={resetView}
                >
                  <RotateCcwIcon className="size-3.5" />
                </Button>
              </WithTooltip>
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
