import type { Dispatch, SetStateAction } from "react"

/** Write a tool result into Image Studio and navigate there. */
export function applyPromptToStudio(opts: {
  prompt: string
  negative: string | null | undefined
  hasNegativePrompt: boolean
  setPrompt: (prompt: string) => void
  setControlValues: Dispatch<SetStateAction<Record<string, unknown>>>
  router: { push: (href: string) => void }
}) {
  const prompt = opts.prompt.trim()
  if (!prompt) return
  opts.setPrompt(prompt)
  if (opts.negative && opts.hasNegativePrompt) {
    opts.setControlValues((prev) => ({ ...prev, negative: opts.negative }))
  }
  opts.router.push("/image")
}
