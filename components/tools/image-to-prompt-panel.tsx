"use client"

import {
  ArrowLeftIcon,
  ClipboardPasteIcon,
  CopyIcon,
  ImageIcon,
  ImagesIcon,
  Loader2Icon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  cancelJob,
  galleryItemCategory,
  gallerySrc,
  isTauri,
  onJobProgress,
  onPromptToolsProgress,
  readImageEmbeddedPrompt,
  runImageToPrompt,
  saveTempToolImage,
  type GalleryItem,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import {
  flattenStructuredFields,
  formatTargetHint,
  parseStructuredPrompt,
  PROMPT_FORMATS,
  PROMPT_TARGETS,
  STRUCTURED_FIELDS,
  targetFromArch,
  type PromptFormatId,
  type PromptTargetId,
  type StructuredFields,
  emptyStructuredFields,
} from "@/lib/prompt-tools"
import { cn } from "@/lib/utils"

const HISTORY_MAX = 12

type HistoryEntry = {
  id: string
  prompt: string
  format: PromptFormatId
  target: PromptTargetId
  at: number
}

async function bytesFromFile(
  file: File
): Promise<{ bytes: Uint8Array; ext: string }> {
  const buf = await file.arrayBuffer()
  const ext =
    file.name.split(".").pop()?.toLowerCase() ||
    file.type.split("/").pop() ||
    "png"
  return { bytes: new Uint8Array(buf), ext }
}

function SessionHistoryList({
  history,
  onSelect,
}: {
  history: HistoryEntry[]
  onSelect: (entry: HistoryEntry) => void
}) {
  return (
    <ul className="divide-y divide-border">
      {history.map((h) => (
        <li key={h.id}>
          <button
            type="button"
            className="w-full px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            onClick={() => onSelect(h)}
          >
            <span className="line-clamp-2">{h.prompt}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function ImageToPromptPanel() {
  const router = useRouter()
  const studio = useStudio()
  const fileRef = useRef<HTMLInputElement>(null)

  const [imagePath, setImagePath] = useState<string | null>(
    () => studio.toolsHandoff?.imagePath ?? null
  )
  const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
    const path = studio.toolsHandoff?.imagePath
    return path ? gallerySrc(path) : null
  })
  const [format, setFormat] = useState<PromptFormatId>("general")
  const [target, setTarget] = useState<PromptTargetId>(() =>
    studio.activeArch ? targetFromArch(studio.activeArch) : "auto"
  )
  const [result, setResult] = useState("")
  const [negative, setNegative] = useState<string | null>(null)
  const [fields, setFields] = useState<StructuredFields | null>(null)
  const [embedded, setEmbedded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [dragging, setDragging] = useState(false)

  const hint = formatTargetHint(format, target)
  const showStructured =
    format === "structured" || format === "json" || format === "graphicDesign"
  const imageGallery = studio.gallery.filter(
    (item) => galleryItemCategory(item) === "image"
  )

  useEffect(() => {
    const path = studio.consumeToolsHandoff()?.imagePath
    if (!path) return
    let cancelled = false
    void readImageEmbeddedPrompt(path)
      .then((emb) => {
        if (!cancelled && emb?.trim()) setEmbedded(emb.trim())
      })
      .catch(() => {
        /* optional */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consume once on mount
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

  const applyImagePath = async (path: string) => {
    setImagePath(path)
    setPreviewUrl(gallerySrc(path))
    setError(null)
    setEmbedded(null)
    try {
      const emb = await readImageEmbeddedPrompt(path)
      if (emb?.trim()) setEmbedded(emb.trim())
    } catch {
      /* optional */
    }
  }

  const clearImage = () => {
    setImagePath(null)
    setPreviewUrl(null)
    setEmbedded(null)
  }

  const ingestFile = async (file: File) => {
    if (!isTauri()) {
      setError("Image upload requires the desktop app.")
      return
    }
    try {
      const { bytes, ext } = await bytesFromFile(file)
      const path = await saveTempToolImage(bytes, ext)
      await applyImagePath(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) void ingestFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith("image/")) void ingestFile(file)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void ingestFile(file)
          }
          break
        }
      }
    }
    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once paste listener
  }, [])

  const applyResultText = useCallback(
    (text: string, nextFormat: PromptFormatId) => {
      setResult(text)
      if (
        nextFormat === "structured" ||
        nextFormat === "json" ||
        nextFormat === "graphicDesign"
      ) {
        setFields(parseStructuredPrompt(text))
      } else {
        setFields(null)
      }
    },
    []
  )

  const displayPrompt = (() => {
    if (fields && (format === "structured" || format === "json")) {
      return flattenStructuredFields(fields)
    }
    return result
  })()

  const run = async () => {
    if (!imagePath) {
      setError("Choose an image first.")
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
            applyResultText(text, format)
            setNegative(p.result?.negative ?? null)
            setHistory((prev) =>
              [
                {
                  id: currentJobId!,
                  prompt: text,
                  format,
                  target,
                  at: Date.now(),
                },
                ...prev,
              ].slice(0, HISTORY_MAX)
            )
            resolve()
          } else if (p.stage === "error") {
            settled = true
            reject(new Error(p.message || "Prompt tool failed"))
          } else if (p.stage === "cancelled") {
            settled = true
            reject(new Error("Cancelled"))
          }
        }).then(() =>
          runImageToPrompt({
            imagePath,
            format,
            target,
            arch: studio.activeArch,
          }).then((job) => {
            currentJobId = job.id
            setJobId(job.id)
          }, reject)
        )
      })
      setStatus(null)
      notifySuccess("Prompt ready")
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
    const prompt = displayPrompt.trim()
    if (!prompt) return
    studio.setPrompt(prompt)
    if (negative && studio.hasNegativePrompt) {
      studio.setControlValues((prev) => ({ ...prev, negative }))
    }
    router.push("/image")
  }

  const pickGallery = (item: GalleryItem) => {
    setGalleryOpen(false)
    void applyImagePath(item.path)
  }

  const hasResult = Boolean(result.trim() || (fields && showStructured))

  return (
    <StudioPanel className="min-h-0 flex-1">
      <StudioPanelHeader
        title="Image to Prompt"
        description="Caption a reference for your target model."
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
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={onFileChange}
        />

        <ToolSurface>
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2">
              <ToolFieldLabel>Source</ToolFieldLabel>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-muted/20 transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border",
                  previewUrl ? "aspect-[16/9]" : "min-h-40"
                )}
              >
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Reference"
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearImage}
                      disabled={busy}
                      className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md border border-border/80 bg-background/90 text-foreground backdrop-blur-sm transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label="Clear image"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-4 text-center">
                    <ImageIcon className="size-6 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">
                      Drop, paste, upload, or pick from gallery
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-9 gap-1.5"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <UploadIcon className="size-3.5" />
                  Upload
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={galleryOpen ? "default" : "secondary"}
                  className="min-h-9 gap-1.5"
                  onClick={() => setGalleryOpen((o) => !o)}
                  disabled={busy}
                >
                  <ImagesIcon className="size-3.5" />
                  Gallery
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-9 gap-1.5"
                  disabled={busy}
                  onClick={() =>
                    notifySuccess("Press Ctrl+V to paste an image")
                  }
                >
                  <ClipboardPasteIcon className="size-3.5" />
                  Paste
                </Button>
              </div>
            </div>

            {galleryOpen ? (
              <div className="h-40 rounded-lg border border-border">
                <ScrollArea className="h-full" scrollbarGutter>
                  <div className="p-1.5">
                    {imageGallery.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        No gallery images yet.
                      </p>
                    ) : (
                      <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                        {imageGallery.slice(0, 24).map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="aspect-square w-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => pickGallery(item)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={gallerySrc(
                                  item.thumbnailPath || item.path
                                )}
                                alt=""
                                className="size-full object-cover"
                              />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : null}

            {embedded ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Embedded prompt found in this file.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="min-h-9 shrink-0"
                  onClick={() => {
                    applyResultText(embedded, format)
                    setNegative(null)
                  }}
                >
                  Use embedded prompt
                </Button>
              </div>
            ) : null}

            <ToolChipRow
              label="Format"
              options={PROMPT_FORMATS}
              value={format}
              onChange={setFormat}
              disabled={busy}
            />
            <ToolChipRow
              label="Target"
              options={PROMPT_TARGETS}
              value={target}
              onChange={setTarget}
              disabled={busy}
            />

            {hint ? (
              <p className="text-xs leading-relaxed text-amber-600/90 dark:text-amber-400/85">
                {hint}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button
                type="button"
                className="min-h-9 min-w-[9rem] gap-1.5"
                disabled={busy || !imagePath}
                onClick={() => void run()}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SparklesIcon className="size-4" />
                )}
                Generate
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
            title="Prompt"
            actions={
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-9 gap-1.5"
                  disabled={!displayPrompt.trim()}
                  onClick={() => {
                    void navigator.clipboard.writeText(displayPrompt)
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
                  disabled={!displayPrompt.trim()}
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
                Generated prompts appear here. Edit freely before sending to
                Image Studio.
              </p>
            ) : fields && showStructured ? (
              <div className="flex flex-col gap-3">
                {STRUCTURED_FIELDS.map((key) => (
                  <label key={key} className="flex flex-col gap-1.5">
                    <ToolFieldLabel>{key}</ToolFieldLabel>
                    <Textarea
                      value={fields[key]}
                      onChange={(e) =>
                        setFields((prev) => ({
                          ...(prev ?? emptyStructuredFields()),
                          [key]: e.target.value,
                        }))
                      }
                      rows={2}
                      className="min-h-16 resize-y"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <Textarea
                value={result}
                onChange={(e) => {
                  setResult(e.target.value)
                  setFields(null)
                }}
                placeholder={busy ? "Working…" : "Prompt output"}
                rows={10}
                className="min-h-48 resize-y"
              />
            )}
          </div>
        </ToolSurface>

        {history.length > 0 ? (
          <ToolSurface>
            <ToolSurfaceHeader title="This session" />
            <div className={history.length > 3 ? "h-56" : undefined}>
              {history.length > 3 ? (
                <ScrollArea className="h-full" scrollbarGutter>
                  <SessionHistoryList
                    history={history}
                    onSelect={(h) => {
                      setFormat(h.format)
                      setTarget(h.target)
                      applyResultText(h.prompt, h.format)
                    }}
                  />
                </ScrollArea>
              ) : (
                <SessionHistoryList
                  history={history}
                  onSelect={(h) => {
                    setFormat(h.format)
                    setTarget(h.target)
                    applyResultText(h.prompt, h.format)
                  }}
                />
              )}
            </div>
          </ToolSurface>
        ) : null}
      </StudioPanelBody>
    </StudioPanel>
  )
}
