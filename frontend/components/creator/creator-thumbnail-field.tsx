"use client"

import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useRef, useState, type ChangeEvent } from "react"
import { Button } from "@/components/ui/button"
import { gallerySrc } from "@/lib/host"
import { isTauri } from "@/lib/host/runtime"
import { notifyError } from "@/lib/notify"
import { cn } from "@/lib/utils"

async function bytesFromFile(
  file: File
): Promise<{ bytes: number[]; ext: string }> {
  const buf = await file.arrayBuffer()
  const bytes = Array.from(new Uint8Array(buf))
  const name = file.name.toLowerCase()
  const ext = name.includes(".")
    ? (name.split(".").pop() ?? "png")
    : file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png"
  return { bytes, ext }
}

export type PendingThumbnail = {
  bytes: number[]
  ext: string
  previewUrl: string
}

type CreatorThumbnailFieldProps = {
  /** Disk path preview when the pack already exists. */
  savedPath?: string | null
  pending?: PendingThumbnail | null
  disabled?: boolean
  onPick: (pending: PendingThumbnail) => void | Promise<void>
  onClear: () => void | Promise<void>
}

export function CreatorThumbnailField({
  savedPath = null,
  pending = null,
  disabled = false,
  onPick,
  onClear,
}: CreatorThumbnailFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const preview = pending?.previewUrl
    ? pending.previewUrl
    : savedPath
      ? gallerySrc(savedPath.split("?")[0] ?? savedPath)
      : null

  async function handleFile(file: File) {
    if (!isTauri()) {
      notifyError("Thumbnails require the desktop app", "Thumbnail")
      return
    }
    setBusy(true)
    try {
      const { bytes, ext } = await bytesFromFile(file)
      const previewUrl = URL.createObjectURL(file)
      await onPick({ bytes, ext, previewUrl })
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Thumbnail")
    } finally {
      setBusy(false)
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) void handleFile(file)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled || busy}
        onChange={onChange}
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/60 bg-muted/20",
          "aspect-[4/3] max-w-xs"
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={preview}
            src={preview}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8 opacity-50" />
            <span className="text-xs">No thumbnail</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="before:hidden"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon />
          {preview ? "Replace" : "Add thumbnail"}
        </Button>
        {preview ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                try {
                  await onClear()
                } catch (e) {
                  notifyError(
                    e instanceof Error ? e.message : String(e),
                    "Thumbnail"
                  )
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            <Trash2Icon />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}
