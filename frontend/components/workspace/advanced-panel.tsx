"use client"

import type { ReactNode } from "react"
import {
  SideRail,
  SideRailBody,
  SideRailHeader,
  SIDE_RAIL_WIDTH,
} from "@/components/shell"

type AdvancedPanelProps = {
  open: boolean
  children: ReactNode
}

export function AdvancedPanel({ open, children }: AdvancedPanelProps) {
  return (
    <SideRail open={open} side="left" width={SIDE_RAIL_WIDTH}>
      <SideRailHeader title="Advanced" />
      <SideRailBody>{children}</SideRailBody>
    </SideRail>
  )
}
