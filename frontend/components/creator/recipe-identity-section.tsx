"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { WithTooltip } from "@/components/ui/tooltip"
import {
  CreatorThumbnailField,
  type PendingThumbnail,
} from "./creator-thumbnail-field"
import {
  clearUserBlueprintThumbnail,
  setUserBlueprintThumbnail,
} from "@/lib/host"
import { notifySuccess } from "@/lib/notify"
import { ARCH_ITEMS, type ArchId } from "@/lib/creator-arches"

const fieldLabel = "text-[11px] font-medium text-muted-foreground"
const sectionTitle =
  "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"

export type RecipeIdentitySectionProps = {
  editing: boolean
  editBlueprintId?: string | null
  busy: boolean
  loadingEdit: boolean
  thumbnailPath: string | null
  pendingThumb: PendingThumbnail | null
  setPendingThumb: (next: PendingThumbnail | null) => void
  setThumbnailPath: (path: string | null) => void
  name: string
  setName: (name: string) => void
  id: string
  setIdTouched: (touched: boolean) => void
  setIdManual: (id: string) => void
  archId: ArchId
  applyArch: (nextId: ArchId) => void
  description: string
  setDescription: (description: string) => void
}

export function RecipeIdentitySection({
  editing,
  editBlueprintId = null,
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
  archId,
  applyArch,
  description,
  setDescription,
}: RecipeIdentitySectionProps) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
      <h2 className={sectionTitle}>Recipe</h2>
      <div className="space-y-1.5">
        <span className={fieldLabel}>Thumbnail</span>
        <CreatorThumbnailField
          savedPath={thumbnailPath}
          pending={pendingThumb}
          disabled={busy || loadingEdit}
          onPick={async (next) => {
            if (pendingThumb) {
              URL.revokeObjectURL(pendingThumb.previewUrl)
            }
            if (editing && editBlueprintId) {
              const path = await setUserBlueprintThumbnail(
                editBlueprintId,
                next.bytes,
                next.ext
              )
              URL.revokeObjectURL(next.previewUrl)
              setPendingThumb(null)
              setThumbnailPath(path)
              notifySuccess("Thumbnail updated")
              return
            }
            setPendingThumb(next)
          }}
          onClear={async () => {
            if (pendingThumb) {
              URL.revokeObjectURL(pendingThumb.previewUrl)
              setPendingThumb(null)
            }
            if (editing && editBlueprintId && thumbnailPath) {
              await clearUserBlueprintThumbnail(editBlueprintId)
              setThumbnailPath(null)
              notifySuccess("Thumbnail removed")
            } else {
              setThumbnailPath(null)
            }
          }}
        />
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={fieldLabel}>Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My realism pack"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={fieldLabel}>Id</span>
          <WithTooltip
            label={
              editing
                ? "Id is fixed while editing. Save as a new recipe to change it."
                : undefined
            }
          >
            <Input
              value={id}
              onChange={(e) => {
                setIdTouched(true)
                setIdManual(e.target.value)
              }}
              placeholder="my-realism-pack"
              className="font-mono text-xs"
              disabled={editing || loadingEdit}
            />
          </WithTooltip>
        </label>
        <div className="flex flex-col gap-1">
          <span className={fieldLabel}>Architecture</span>
          <Select
            items={ARCH_ITEMS}
            value={ARCH_ITEMS.find((i) => i.value === archId) ?? null}
            onValueChange={(item) => {
              if (item) applyArch(item.value)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {ARCH_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={fieldLabel}>Description</span>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes"
            rows={1}
            className="min-h-9 resize-none"
          />
        </label>
      </div>
    </section>
  )
}
