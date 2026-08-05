"use client"

import {
  ClipboardPasteIcon,
  ImageIcon,
  ImagesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, type ChangeEvent, type DragEvent } from "react"
import { selectActiveArch } from "@/components/studio/selectors"
import { useStudioSelector, useStudioStore } from "@/components/studio/store"
import { displayImageToPrompt } from "@/components/studio/slices/tools"
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
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  galleryItemCategory,
  gallerySrc,
  isTauri,
  saveTempToolImage,
  type GalleryItem,
} from "@/lib/host"
import { notifySuccess } from "@/lib/notify"
import {
  PROMPT_FORMATS,
  PROMPT_TARGETS,
  STRUCTURED_FIELDS,
  targetFromArch,
} from "@/lib/prompt-tools"
import { cn } from "@/lib/utils"

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

export function ImageToPromptPanel() {
  const gallery = useStudioStore((s) => s.gallery)
  const consumeToolsHandoff = useStudioStore((s) => s.consumeToolsHandoff)
  const state = useStudioStore((s) => s.imageToPrompt)
  const patch = useStudioStore((s) => s.patchImageToPrompt)
  const run = useStudioStore((s) => s.runImageToPromptTool)
  const cancel = useStudioStore((s) => s.cancelImageToPromptTool)
  const activeArch = useStudioSelector(selectActiveArch)
  const { sendToStudio } = useToolStudioBridge()
  const fileRef = useRef<HTMLInputElement>(null)

  const {
    imagePath,
    previewUrl,
    format,
    target,
    result,
    negative,
    fields,
    busy,
    status,
    error,
    jobId,
    galleryOpen,
  } = state

  useEffect(() => {
    const handoff = consumeToolsHandoff()
    if (handoff?.imagePath && !useStudioStore.getState().imageToPrompt.busy) {
      patch({
        imagePath: handoff.imagePath,
        previewUrl: gallerySrc(handoff.imagePath),
        error: null,
      })
    } else if (
      !useStudioStore.getState().imageToPrompt.busy &&
      activeArch &&
      useStudioStore.getState().imageToPrompt.target === "auto"
    ) {
      patch({ target: targetFromArch(activeArch) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once on mount
  }, [])

  const applyImagePath = (path: string) => {
    patch({
      imagePath: path,
      previewUrl: gallerySrc(path),
      error: null,
    })
  }

  const clearImage = () => {
    patch({ imagePath: null, previewUrl: null })
  }

  const ingestFile = async (file: File) => {
    if (!isTauri()) {
      patch({ error: "Image upload requires the desktop app." })
      return
    }
    try {
      const { bytes, ext } = await bytesFromFile(file)
      const path = await saveTempToolImage(bytes, ext)
      applyImagePath(path)
    } catch (e) {
      patch({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) void ingestFile(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    patch({ galleryOpen: false })
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

  const displayPrompt = displayImageToPrompt(state)
  const showStructured =
    format === "structured" || format === "json" || format === "graphicDesign"
  const imageGallery = gallery.filter(
    (item) => galleryItemCategory(item) === "image"
  )
  const hasResult = Boolean(result.trim() || (fields && showStructured))

  const pickGallery = (item: GalleryItem) => {
    patch({ galleryOpen: false })
    applyImagePath(item.path)
  }

  return (
    <ToolPanelChrome
      title="Image to Prompt"
      description="Caption a reference for your target model."
    >
      <ToolModelGate providerId="qwenvl" toolLabel="Image to Prompt">
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
                }}
                onDrop={onDrop}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-muted/20 transition-colors",
                  "border-border",
                  previewUrl ? "aspect-[16/9]" : "min-h-40"
                )}
              >
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Reference"
                      className="size-full object-contain"
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
                  onClick={() => patch({ galleryOpen: !galleryOpen })}
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

            <ToolChipRow
              label="Format"
              options={PROMPT_FORMATS}
              value={format}
              onChange={(v) => patch({ format: v })}
              disabled={busy}
            />
            <ToolChipRow
              label="Target"
              options={PROMPT_TARGETS}
              value={target}
              onChange={(v) => patch({ target: v })}
              disabled={busy}
            />

            <ToolRunBar
              label="Generate"
              busy={busy}
              disabled={!imagePath}
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
            title="Prompt"
            actions={
              <ToolResultActions
                copyText={displayPrompt}
                copyDisabled={!displayPrompt.trim()}
                useInStudioDisabled={!displayPrompt.trim()}
                onUseInStudio={() => sendToStudio(displayPrompt, negative)}
              />
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
                        patch({
                          fields: {
                            ...fields,
                            [key]: e.target.value,
                          },
                        })
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
                onChange={(e) =>
                  patch({ result: e.target.value, fields: null })
                }
                placeholder={busy ? "Working…" : "Prompt output"}
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
