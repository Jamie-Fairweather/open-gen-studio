"use client"

import { useRouter } from "next/navigation"
import { selectHasNegativePrompt } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { applyPromptToStudio } from "@/components/tools/apply-prompt-to-studio"

/** Shared Image Studio handoff for prompt-tool panels. */
export function useToolStudioBridge() {
  const router = useRouter()
  const setPrompt = useStudioStore((s) => s.setPrompt)
  const setControlValues = useStudioStore((s) => s.setControlValues)
  const hasNegativePrompt = useStudioSelector(selectHasNegativePrompt)

  function sendToStudio(prompt: string, negative: string | null | undefined) {
    applyPromptToStudio({
      prompt,
      negative,
      hasNegativePrompt,
      setPrompt,
      setControlValues,
      router,
    })
  }

  return { sendToStudio, hasNegativePrompt }
}
