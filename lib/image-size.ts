/** Aspect ratio + side-length → pixel size (area-preserving). */

export type AspectRatio = {
  id: string
  /** Short id shown in the toolbar, e.g. "16:9". */
  label: string
  /** Longer name for the select, e.g. "16:9 (Standard Widescreen)". */
  name: string
  w: number
  h: number
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { id: "1:1", label: "1:1", name: "1:1 (Square)", w: 1, h: 1 },
  { id: "4:3", label: "4:3", name: "4:3 (Old PC)", w: 4, h: 3 },
  { id: "3:2", label: "3:2", name: "3:2 (Semi-wide)", w: 3, h: 2 },
  { id: "8:5", label: "8:5", name: "8:5", w: 8, h: 5 },
  {
    id: "16:9",
    label: "16:9",
    name: "16:9 (Standard Widescreen)",
    w: 16,
    h: 9,
  },
  {
    id: "21:9",
    label: "21:9",
    name: "21:9 (Ultra-Widescreen)",
    w: 21,
    h: 9,
  },
  { id: "3:4", label: "3:4", name: "3:4", w: 3, h: 4 },
  { id: "2:3", label: "2:3", name: "2:3 (Semi-tall)", w: 2, h: 3 },
  { id: "5:8", label: "5:8", name: "5:8", w: 5, h: 8 },
  { id: "9:16", label: "9:16", name: "9:16 (Tall)", w: 9, h: 16 },
  { id: "9:21", label: "9:21", name: "9:21 (Ultra-Tall)", w: 9, h: 21 },
]

export const SIDE_LENGTH_MIN = 256
export const SIDE_LENGTH_MAX = 4096
export const SIDE_LENGTH_STEP = 64
export const SIDE_LENGTH_DEFAULT = 1024

/** Quick picks shown above the fine slider. */
export const SIDE_LENGTH_PRESETS = [512, 768, 1024, 1536, 2048] as const

export function roundTo(n: number, multiple: number): number {
  if (multiple <= 0) return Math.round(n)
  return Math.max(multiple, Math.round(n / multiple) * multiple)
}

export function clampSideLength(side: number): number {
  const clamped = Math.min(SIDE_LENGTH_MAX, Math.max(SIDE_LENGTH_MIN, side))
  return roundTo(clamped, SIDE_LENGTH_STEP)
}

/** Keep ~side² pixels for the given aspect; round dims to multiples of 16. */
export function sizeFromAspectAndSide(
  aspectId: string,
  sideLength: number
): { width: number; height: number } {
  const aspect =
    ASPECT_RATIOS.find((a) => a.id === aspectId) ?? ASPECT_RATIOS[0]
  const side = clampSideLength(sideLength)
  const area = side * side
  const height = roundTo(Math.sqrt(area * (aspect.h / aspect.w)), 16)
  const width = roundTo(height * (aspect.w / aspect.h), 16)
  return { width, height }
}

/** Closest known aspect for a width×height pair. */
export function aspectIdFromSize(width: number, height: number): string {
  if (!(width > 0) || !(height > 0)) return ASPECT_RATIOS[0].id
  const target = width / height
  let best = ASPECT_RATIOS[0]
  let bestErr = Infinity
  for (const a of ASPECT_RATIOS) {
    const err = Math.abs(a.w / a.h - target)
    if (err < bestErr) {
      bestErr = err
      best = a
    }
  }
  return best.id
}

/** Side length whose area matches width×height (snapped to slider steps). */
export function sideLengthFromSize(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return SIDE_LENGTH_DEFAULT
  return clampSideLength(Math.sqrt(width * height))
}

export function syncSizeControls(
  width: number,
  height: number
): { aspectId: string; sideLength: number } {
  return {
    aspectId: aspectIdFromSize(width, height),
    sideLength: sideLengthFromSize(width, height),
  }
}
