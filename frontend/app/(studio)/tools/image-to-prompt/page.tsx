"use client"

import { ImageToPromptPanel } from "@/components/tools/image-to-prompt-panel"

export default function ImageToPromptPage() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <ImageToPromptPanel />
    </div>
  )
}
