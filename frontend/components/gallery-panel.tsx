"use client"

import {
  ImageIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"
import { memo, useMemo } from "react"
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
  onImageToPrompt?: (item: GalleryItem) => void
  /** Show the Live ghost tile while a generate job can be followed. */
  showLive?: boolean
  livePreviewSrc?: string | null
  followLive?: boolean
  onSelectLive?: () => void
}

type GalleryTileProps = {
  item: GalleryItem
  selected: boolean
  canReusePrompt: boolean
  canReuseSettings: boolean
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void | Promise<void>
  onReusePrompt: (item: GalleryItem) => void
  onReuseSettings: (item: GalleryItem) => void
  onImageToPrompt?: (item: GalleryItem) => void
}

const GalleryTile = memo(function GalleryTile({
  item,
  selected,
  canReusePrompt,
  canReuseSettings,
  onSelect,
  onDelete,
  onReusePrompt,
  onReuseSettings,
  onImageToPrompt,
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
      {canReusePrompt || canReuseSettings || onImageToPrompt ? (
        <div className="absolute start-1.5 bottom-1.5 z-20 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onImageToPrompt ? (
            <WithTooltip label="Image to Prompt">
              <Button
                type="button"
                size="icon-xs"
                variant="default"
                className="rounded-md shadow-md"
                onClick={() => onImageToPrompt(item)}
                aria-label="Image to Prompt"
              >
                <ImageIcon />
              </Button>
            </WithTooltip>
          ) : null}
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
          onClick={() => void onDelete(item.id)}
          aria-label="Delete"
        >
          <Trash2Icon />
        </Button>
      </WithTooltip>
    </div>
  )
})

const LiveGalleryTile = memo(function LiveGalleryTile({
  previewSrc,
  selected,
  onSelect,
}: {
  previewSrc: string | null
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg bg-muted/80",
        !selected && "hover:brightness-110"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="absolute inset-0 outline-none"
        aria-label={
          selected ? "Stop following live preview" : "Follow live preview"
        }
        aria-pressed={selected}
      >
        {previewSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt=""
            decoding="async"
            draggable={false}
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center bg-primary/10">
            <ImageIcon className="size-6 text-primary/80" />
          </span>
        )}
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute start-1.5 top-1.5 z-20 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary-foreground uppercase"
      >
        Live
      </span>
      {selected ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
        />
      ) : null}
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
  onImageToPrompt,
  showLive = false,
  livePreviewSrc = null,
  followLive = false,
  onSelectLive,
}: GalleryPanelProps) {
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

  const empty = items.length === 0 && !showLive

  return (
    <SideRail open={open} side="right" width={SIDE_RAIL_WIDTH}>
      <SideRailHeader title={title} count={items.length} />
      <SideRailBody>
        {empty ? (
          <p className="px-1 py-16 text-center text-sm text-muted-foreground">
            Generate something to fill this shelf.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {showLive && onSelectLive ? (
              <LiveGalleryTile
                previewSrc={livePreviewSrc}
                selected={followLive}
                onSelect={onSelectLive}
              />
            ) : null}
            {tiles.map(({ item, canReusePrompt, canReuseSettings }) => (
              <GalleryTile
                key={item.id}
                item={item}
                selected={!followLive && selectedId === item.id}
                canReusePrompt={canReusePrompt}
                canReuseSettings={canReuseSettings}
                onSelect={onSelect}
                onDelete={onDelete}
                onReusePrompt={onReusePrompt}
                onReuseSettings={onReuseSettings}
                onImageToPrompt={onImageToPrompt}
              />
            ))}
          </div>
        )}
      </SideRailBody>
    </SideRail>
  )
}
