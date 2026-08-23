"use client"

import { useEffect } from "react"
import { selectActiveArch } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { ToolModelGate } from "@/components/tools/tool-model-gate"
import { ToolPanelChrome } from "@/components/tools/tool-panel-chrome"
import { ToolResultActions } from "@/components/tools/tool-result-actions"
import { ToolRunBar } from "@/components/tools/tool-run-bar"
import {
  ToolChipRow,
  ToolFieldLabel,
  ToolSurface,
  ToolSurfaceHeader,
} from "@/components/tools/tool-shell"
import { useToolStudioBridge } from "@/components/tools/use-tool-studio-bridge"
import { Textarea } from "@/components/ui/textarea"
import {
  ENHANCE_MODES,
  PROMPT_TARGETS,
  STYLE_LOOKS,
  targetFromArch,
} from "@/lib/prompt-tools"

/** Prompt Enhancer: seed once from handoff or studio prompt, then enhance/edit. Does not write studio until confirm. */
export function PromptEnhancerPanel() {
  const studioPrompt = useStudioStore((s) => s.prompt)
  const consumeToolsHandoff = useStudioStore((s) => s.consumeToolsHandoff)
  const state = useStudioStore((s) => s.promptEnhance)
  const patch = useStudioStore((s) => s.patchPromptEnhance)
  const run = useStudioStore((s) => s.runPromptEnhanceTool)
  const cancel = useStudioStore((s) => s.cancelPromptEnhanceTool)
  const activeArch = useStudioSelector(selectActiveArch)
  const { sendToStudio } = useToolStudioBridge()

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

  const hasResult = Boolean(result.trim())

  return (
    <ToolPanelChrome
      title="Prompt Enhancer"
      description="Expand a short idea into a model-ready prompt."
    >
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

            <ToolRunBar
              label="Enhance"
              busy={busy}
              disabled={!input.trim()}
              jobId={jobId}
              status={status}
              error={error}
              onRun={() => void run()}
              onCancel={() => void cancel()}
            />
          </div>
        </ToolSurface>

        <ToolSurface>
          <ToolSurfaceHeader
            title="Enhanced prompt"
            actions={
              <ToolResultActions
                copyText={result}
                copyDisabled={!result.trim()}
                useInStudioDisabled={!result.trim()}
                onUseInStudio={() => sendToStudio(result, negative)}
              />
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
    </ToolPanelChrome>
  )
}
