import type { ImgHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

type BrandMarkProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt" | "children"
>

/**
 * Open Gen Studio mark — same stacked plates as the app icon
 * (`branding/brand-mark.svg` / `public/brand-mark.svg`).
 */
export function BrandMark({ className, ...props }: BrandMarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset
    <img
      src="/brand-mark.svg"
      alt=""
      draggable={false}
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  )
}
