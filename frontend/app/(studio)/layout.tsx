"use client"

import type { ReactNode } from "react"
import { StudioBootstrap } from "@/components/studio/studio-bootstrap"
import { StudioChrome } from "@/components/studio/studio-chrome"

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioBootstrap>
      <StudioChrome>{children}</StudioChrome>
    </StudioBootstrap>
  )
}
