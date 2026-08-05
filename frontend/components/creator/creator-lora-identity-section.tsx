"use client"

import type { Dispatch, SetStateAction } from "react"
import {
  CreatorThumbnailField,
  type PendingThumbnail,
} from "./creator-thumbnail-field"
import { Input } from "@/components/ui/input"
import { clearUserLoraThumbnail, setUserLoraThumbnail } from "@/lib/host"
import { notifySuccess } from "@/lib/notify"

export type CreatorLoraIdentitySectionProps = {
  editing: boolean
  editLoraId?: string | null
  busy: boolean
  loadingEdit: boolean
  thumbnailPath: string | null
  pendingThumb: PendingThumbnail | null
  setPendingThumb: Dispatch<SetStateAction<PendingThumbnail | null>>
  setThumbnailPath: (path: string | null) => void
  name: string
  setName: (name: string) => void
  id: string
  setIdTouched: (touched: boolean) => void
  setIdManual: (id: string) => void
}

export function CreatorLoraIdentitySection({
  editing,
  editLoraId = null,
  busy,
  loadingEdit,
  thumbnailPath,
  pendingThumb,
  setPendingThumb,
  setThumbnailPath,
  name,
  setName,
  id,
  setIdTouched,
  setIdManual,
}: CreatorLoraIdentitySectionProps) {
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
        Pack
      </p>
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">
          Thumbnail
        </span>
        <CreatorThumbnailField
          savedPath={thumbnailPath}
          pending={pendingThumb}
          disabled={busy || loadingEdit}
          onPick={async (next) => {
            setPendingThumb((prev) => {
              if (prev) URL.revokeObjectURL(prev.previewUrl)
              return null
            })
            if (editing && editLoraId) {
              const path = await setUserLoraThumbnail(
                editLoraId,
                next.bytes,
                next.ext
              )
              URL.revokeObjectURL(next.previewUrl)
              setThumbnailPath(path)
              notifySuccess("Thumbnail updated")
              return
            }
            setPendingThumb(next)
          }}
          onClear={async () => {
            setPendingThumb((prev) => {
              if (prev) URL.revokeObjectURL(prev.previewUrl)
              return null
            })
            if (editing && editLoraId && thumbnailPath) {
              await clearUserLoraThumbnail(editLoraId)
              setThumbnailPath(null)
              notifySuccess("Thumbnail removed")
            } else {
              setThumbnailPath(null)
            }
          }}
        />
      </div>
      <Input
        placeholder="Name"
        value={name}
        disabled={loadingEdit}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Id"
        value={id}
        disabled={editing || loadingEdit}
        onChange={(e) => {
          setIdTouched(true)
          setIdManual(e.target.value)
        }}
        className="font-mono text-sm"
      />
    </section>
  )
}
