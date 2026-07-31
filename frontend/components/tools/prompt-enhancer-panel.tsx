"use client"

import {
  ArrowLeftIcon,
  CopyIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import {
  selectActiveArch,
  selectHasNegativePrompt,
} from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/studio-panel"
import { ToolModelGate } from "@/components/tools/tool-model-gate"
import {
  ToolChipRow,
  ToolFieldLabel,
  ToolSurface,
  ToolSurfaceHeader,
} from "@/components/tools/tool-shell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { notifySuccess } from "@/lib/notify"
import {
  ENHANCE_MODES,
  PROMPT_TARGETS,
  STYLE_LOOKS,
  targetFromArch,
} from "@/lib/prompt-tools"

export function PromptEnhancerPanel() {
  const router = useRouter()
  const studioPrompt = useStudioStore((s) => s.prompt)
  const consumeToolsHandoff = useStudioStore((s) => s.consumeToolsHandoff)
  const setPrompt = useStudioStore((s) => s.setPrompt)
  const setControlValues = useStudioStore((s) => s.setControlValues)
  const state = useStudioStore((s) => s.promptEnhance)
  const patch = useStudioStore((s) => s.patchPromptEnhance)
  const run = useStudioStore((s) => s.runPromptEnhanceTool)
  const cancel = useStudioStore((s) => s.cancelPromptEnhanceTool)
  const activeArch = useStudioSelector(selectActiveArch)
  const hasNegativePrompt = useStudioSelector(selectHasNegativePrompt)

  const {
    input,
    result,
    negative,
    target,
    mode,
    styleLook,
    busy,
    status,
    error,
    jobId,
    seeded,
  } = state

  useEffect(() => {
    // Studio Enhance button seeds via seedPromptEnhance before navigate.
    // This mount path covers Tools index / deep links only.
    if (seeded) {
      void consumeToolsHandoff()
      return
    }
    if (useStudioStore.getState().promptEnhance.busy) {
      patch({ seeded: true })
      return
    }
    const handoff = consumeToolsHandoff()
    const seed =
      handoff?.prompt?.trim() ||
      (!input.trim() ? studioPrompt.trim() : "") ||
      input
    patch({
      seeded: true,
      input: seed,
      target: activeArch ? targetFromArch(activeArch) : target,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once
  }, [])

  const useInStudio = () => {
    const prompt = (result || input).trim()
    if (!prompt) return
    setPrompt(prompt)
    if (negative && hasNegativePrompt) {
      setControlValues((prev) => ({ ...prev, negative }))
    }
    router.push("/image")
  }

  const hasResult = Boolean(result.trim())

  return (
    <StudioPanel className="min-h-0 flex-1">
      <StudioPanelHeader
        title="Prompt Enhancer"
        description="Expand a short idea into a model-ready prompt."
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
      <StudioPanelBody className="gap-4">
        <ToolModelGate providerId="enhancer" toolLabel="Prompt Enhancer">
          <ToolSurface>
            <div className="flex flex-col gap-4 p-4">
              <label className="flex flex-col gap-2">
                <ToolFieldLabel>Your idea</ToolFieldLabel>
                <Textarea
                  value={input}
                  onChange={(e) => patch({ input: e.target.value })}
                  disabled={busy}
                  rows={6}
                  placeholder="A short subject or rough prompt…"
                  className="min-h-32 resize-y"
                />
              </label>

              <ToolChipRow
                label="Mode"
                options={ENHANCE_MODES.map((m) => ({
                  id: m.id,
                  label: m.label,
                }))}
                value={mode}
                onChange={(v) => patch({ mode: v })}
                disabled={busy}
              />
              {mode === "style" ? (
                <ToolChipRow
                  label="Look"
                  options={STYLE_LOOKS}
                  value={styleLook}
                  onChange={(v) => patch({ styleLook: v })}
                  disabled={busy}
                />
              ) : null}
              <ToolChipRow
                label="Target"
                options={PROMPT_TARGETS}
                value={target}
                onChange={(v) => patch({ target: v })}
                disabled={busy}
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  className="min-h-9 min-w-[9rem] gap-1.5"
                  disabled={busy || !input.trim()}
                  onClick={() => void run()}
                >
                  {busy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SparklesIcon className="size-4" />
                  )}
                  Enhance
                </Button>
                {busy && jobId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-9"
                    onClick={() => void cancel()}
                  >
                    Cancel
                  </Button>
                ) : null}
                {status ? (
                  <p className="text-xs text-muted-foreground">{status}</p>
                ) : null}
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </ToolSurface>

          <ToolSurface>
            <ToolSurfaceHeader
              title="Enhanced prompt"
              actions={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-9 gap-1.5"
                    disabled={!result.trim()}
                    onClick={() => {
                      void navigator.clipboard.writeText(result)
                      notifySuccess("Copied")
                    }}
                  >
                    <CopyIcon className="size-3.5" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-9"
                    disabled={!result.trim() && !input.trim()}
                    onClick={useInStudio}
                  >
                    Use in Studio
                  </Button>
                </>
              }
            />
            <div className="p-4">
              {!hasResult && !busy ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Enhanced text appears here. Nothing is written to Image Studio
                  until you confirm.
                </p>
              ) : (
                <Textarea
                  value={result}
                  onChange={(e) => patch({ result: e.target.value })}
                  placeholder={busy ? "Working…" : "Enhanced prompt"}
                  rows={10}
                  className="min-h-48 resize-y"
                />
              )}
            </div>
          </ToolSurface>
        </ToolModelGate>
      </StudioPanelBody>
    </StudioPanel>
  )
}
