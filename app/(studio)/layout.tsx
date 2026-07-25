"use client"

import type { ReactNode } from "react"
import { StudioChrome } from "@/components/studio/studio-chrome"
import { StudioProvider } from "@/components/studio/studio-provider"

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <StudioProvider>
      <StudioChrome>{children}</StudioChrome>
    </StudioProvider>
  )
}
