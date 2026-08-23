"use client"

import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/shell"
import { Button } from "@/components/ui/button"

/** Studio-panel chrome for one tool, with a back link to the Tools index. */
export function ToolPanelChrome({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <StudioPanel className="min-h-0 flex-1">
      <StudioPanelHeader
        title={title}
        description={description}
        action={
          <Button
            render={<Link href="/tools" />}
            variant="ghost"
            size="sm"
            className="gap-1.5"
          >
            <ArrowLeftIcon className="size-3.5" />
            Tools
          </Button>
        }
      />
      <StudioPanelBody className="gap-4">{children}</StudioPanelBody>
    </StudioPanel>
  )
}
