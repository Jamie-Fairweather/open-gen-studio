"use client"

import {
  ArrowLeftIcon,
  CopyIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useStudio } from "@/components/studio/studio-provider"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelHeader,
} from "@/components/studio-panel"
import {
  ToolChipRow,
  ToolFieldLabel,
  ToolSurface,
  ToolSurfaceHeader,
} from "@/components/tools/tool-shell"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  cancelJob,
  isTauri,
  onJobProgress,
  onPromptToolsProgress,
  runPromptEnhance,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
  ENHANCE_MODES,
  PROMPT_TARGETS,
  STYLE_LOOKS,
  enhanceModePayload,
  targetFromArch,
  type PromptTargetId,
} from "@/lib/prompt-tools"

export function PromptEnhancerPanel() {
  const router = useRouter()
  const studio = useStudio()
  const [input, setInput] = useState(() => {
    const handoff = studio.toolsHandoff
    if (handoff?.prompt?.trim()) return handoff.prompt.trim()
    return studio.prompt.trim()
  })
  const [result, setResult] = useState("")
  const [negative, setNegative] = useState<string | null>(null)
  const [target, setTarget] = useState<PromptTargetId>(() =>
    studio.activeArch ? targetFromArch(studio.activeArch) : "auto"
  )
  const [mode, setMode] = useState("expand")
  const [styleLook, setStyleLook] = useState("cinematic")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  useEffect(() => {
    studio.consumeToolsHandoff()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume once
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void onPromptToolsProgress((p) => {
      if (p.message) setStatus(p.message)
    }).then((u) => {
      unlisten = u
    })
    return () => unlisten?.()
  }, [])

  const run = async () => {
    const prompt = input.trim()
    if (!prompt) {
      setError("Enter a prompt to enhance.")
      return
    }
    if (!isTauri()) {
      setError("Prompt Tools require the desktop app.")
      return
    }
    setBusy(true)
    setError(null)
    setStatus("Starting…")
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let currentJobId: string | null = null
        void onJobProgress((p) => {
          if (!currentJobId || p.jobId !== currentJobId || settled) return
          if (p.message) setStatus(p.message)
          if (p.stage === "done") {
            settled = true
            const text = p.result?.prompt ?? p.text ?? ""
            if (!text) {
              reject(new Error("No prompt returned"))
              return
            }
            setResult(text)
            setNegative(p.result?.negative ?? null)
            resolve()
          } else if (p.stage === "error") {
            settled = true
            reject(new Error(p.message || "Enhance failed"))
          } else if (p.stage === "cancelled") {
            settled = true
            reject(new Error("Cancelled"))
          }
        }).then(() =>
          runPromptEnhance({
            prompt,
            target,
            arch: studio.activeArch,
            mode: enhanceModePayload(mode, styleLook),
          }).then((job) => {
            currentJobId = job.id
            setJobId(job.id)
          }, reject)
        )
      })
      setStatus(null)
      notifySuccess("Enhanced prompt ready")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      notifyError(msg)
      setStatus(null)
    } finally {
      setBusy(false)
      setJobId(null)
    }
  }

  const useInStudio = () => {
    const prompt = (result || input).trim()
    if (!prompt) return
    studio.setPrompt(prompt)
    if (negative && studio.hasNegativePrompt) {
      studio.setControlValues((prev) => ({ ...prev, negative }))
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
        <ToolSurface>
          <div className="flex flex-col gap-4 p-4">
            <label className="flex flex-col gap-2">
              <ToolFieldLabel>Your idea</ToolFieldLabel>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
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
              onChange={setMode}
              disabled={busy}
            />
            {mode === "style" ? (
              <ToolChipRow
                label="Look"
                options={STYLE_LOOKS}
                value={styleLook}
                onChange={setStyleLook}
                disabled={busy}
              />
            ) : null}
            <ToolChipRow
              label="Target"
              options={PROMPT_TARGETS}
              value={target}
              onChange={setTarget}
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
                  onClick={() => void cancelJob(jobId)}
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
                onChange={(e) => setResult(e.target.value)}
                placeholder={busy ? "Working…" : "Enhanced prompt"}
                rows={10}
                className="min-h-48 resize-y"
              />
            )}
          </div>
        </ToolSurface>
      </StudioPanelBody>
    </StudioPanel>
  )
}
