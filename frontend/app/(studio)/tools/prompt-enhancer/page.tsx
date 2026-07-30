"use client"

import { PromptEnhancerPanel } from "@/components/tools/prompt-enhancer-panel"

export default function PromptEnhancerPage() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <PromptEnhancerPanel />
    </div>
  )
}
