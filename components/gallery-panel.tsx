"use client"

import { SlidersHorizontalIcon, Trash2Icon, TypeIcon } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"
import {
  SideRail,
  SideRailBody,
  SideRailHeader,
  SIDE_RAIL_WIDTH,
} from "@/components/side-rail"
import { Button } from "@/components/ui/button"
import { WithTooltip } from "@/components/ui/tooltip"
import { gallerySrc, parseGalleryRecipe, type GalleryItem } from "@/lib/host"
import { cn } from "@/lib/utils"

type GalleryPanelProps = {
  open: boolean
  title?: string
  items: GalleryItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => Promise<void>
  onReusePrompt: (item: GalleryItem) => void
  onReuseSettings: (item: GalleryItem) => void
}

type GalleryTileProps = {
  item: GalleryItem
  selected: boolean
  canReusePrompt: boolean
  canReuseSettings: boolean
  deleting: boolean
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onReusePrompt: (item: GalleryItem) => void
  onReuseSettings: (item: GalleryItem) => void
}

const GalleryTile = memo(function GalleryTile({
  item,
  selected,
  canReusePrompt,
  canReuseSettings,
  deleting,
  onSelect,
  onDelete,
  onReusePrompt,
  onReuseSettings,
}: GalleryTileProps) {
  const src = gallerySrc(item.thumbnailPath || item.path)

  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg bg-muted/80",
        // Skip layout/paint for off-screen cells while scrolling.
        "[contain-intrinsic-size:auto_9rem] [content-visibility:auto]",
        !selected && "hover:brightness-110"
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(selected ? null : item.id)}
        className="absolute inset-0 outline-none"
        aria-label={selected ? "Deselect image" : "Select image"}
        aria-pressed={selected}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
        />
      </button>
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
        />
      ) : null}
      {canReusePrompt || canReuseSettings ? (
        <div className="absolute start-1.5 bottom-1.5 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canReusePrompt ? (
            <WithTooltip label="Reuse prompt">
              <Button
                type="button"
                size="icon-xs"
                variant="default"
                className="rounded-md shadow-md"
                onClick={() => onReusePrompt(item)}
                aria-label="Reuse prompt"
              >
                <TypeIcon />
              </Button>
            </WithTooltip>
          ) : null}
          {canReuseSettings ? (
            <WithTooltip label="Reuse all settings">
              <Button
                type="button"
                size="icon-xs"
                variant="default"
                className="rounded-md shadow-md"
                onClick={() => onReuseSettings(item)}
                aria-label="Reuse all settings"
              >
                <SlidersHorizontalIcon />
              </Button>
            </WithTooltip>
          ) : null}
        </div>
      ) : null}
      <WithTooltip label="Delete">
        <Button
          type="button"
          size="icon-xs"
          variant="destructive"
          className="absolute end-1.5 top-1.5 z-20 rounded-md opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          disabled={deleting}
          onClick={() => onDelete(item.id)}
          aria-label="Delete"
        >
          <Trash2Icon />
        </Button>
      </WithTooltip>
    </div>
  )
})

export function GalleryPanel({
  open,
  title = "Gallery",
  items,
  selectedId,
  onSelect,
  onDelete,
  onReusePrompt,
  onReuseSettings,
}: GalleryPanelProps) {
  const [deleting, setDeleting] = useState(false)

  const tiles = useMemo(
    () =>
      items.map((item) => {
        const recipe = parseGalleryRecipe(item)
        return {
          item,
          canReusePrompt: Boolean(recipe?.prompt),
          canReuseSettings: recipe != null,
        }
      }),
    [items]
  )

  const handleDelete = useCallback(
    (id: string) => {
      setDeleting(true)
      void onDelete(id).finally(() => setDeleting(false))
    },
    [onDelete]
  )

  return (
    <SideRail open={open} side="right" width={SIDE_RAIL_WIDTH}>
      <SideRailHeader title={title} count={items.length} />
      <SideRailBody>
        {items.length === 0 ? (
          <p className="px-1 py-16 text-center text-sm text-muted-foreground">
            Generate something to fill this shelf.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(({ item, canReusePrompt, canReuseSettings }) => (
              <GalleryTile
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                canReusePrompt={canReusePrompt}
                canReuseSettings={canReuseSettings}
                deleting={deleting}
                onSelect={onSelect}
                onDelete={handleDelete}
                onReusePrompt={onReusePrompt}
                onReuseSettings={onReuseSettings}
              />
            ))}
          </div>
        )}
      </SideRailBody>
    </SideRail>
  )
}
