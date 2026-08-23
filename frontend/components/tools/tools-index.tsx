"use client"

import { ArrowRightIcon, ImageIcon, WandSparklesIcon } from "lucide-react"
import Link from "next/link"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/shell"
import { cn } from "@/lib/utils"

const TOOLS = [
  {
    id: "image-to-prompt",
    href: "/tools/image-to-prompt",
    title: "Image to Prompt",
    description: "Caption a reference image for your target model family.",
    icon: ImageIcon,
  },
  {
    id: "prompt-enhancer",
    href: "/tools/prompt-enhancer",
    title: "Prompt Enhancer",
    description: "Expand a short idea into a richer, model-ready prompt.",
    icon: WandSparklesIcon,
  },
] as const

/** Tools catalog — utility workflows that feed Image Studio. */
export function ToolsIndex() {
  return (
    <StudioPanel className="min-h-0 flex-1">
      <StudioPanelHeader
        title="Tools"
        description="Utility workflows that feed Image Studio."
      />
      <StudioPanelBody className="gap-0">
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {TOOLS.map((tool) => {
            const Icon = tool.icon
            return (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  className={cn(
                    "group flex items-center gap-4 px-4 py-4 transition-colors",
                    "hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-sm font-semibold tracking-tight">
                      {tool.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">
                      {tool.description}
                    </span>
                  </span>
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </StudioPanelBody>
    </StudioPanel>
  )
}
