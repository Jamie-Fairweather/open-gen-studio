"use client"

import { SlidersHorizontalIcon, Trash2Icon, TypeIcon } from "lucide-react"
import { useMemo, useState } from "react"
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

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  )

  async function handleDeleteFor(id: string) {
    setDeleting(true)
    try {
      await onDelete(id)
    } finally {
      setDeleting(false)
    }
  }

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
            {items.map((item) => {
              const isSelected = selected?.id === item.id
              const recipe = parseGalleryRecipe(item)
              const canReusePrompt = Boolean(recipe?.prompt)
              const canReuseSettings = recipe != null
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg bg-muted/80",
                    !isSelected && "hover:brightness-110"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(isSelected ? null : item.id)}
                    className="absolute inset-0 outline-none"
                    aria-label={isSelected ? "Deselect image" : "Select image"}
                    aria-pressed={isSelected}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gallerySrc(item.path)}
                      alt=""
                      className="size-full object-cover"
                    />
                  </button>
                  {isSelected ? (
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
                      onClick={() => void handleDeleteFor(item.id)}
                      aria-label="Delete"
                    >
                      <Trash2Icon />
                    </Button>
                  </WithTooltip>
                </div>
              )
            })}
          </div>
        )}
      </SideRailBody>
    </SideRail>
  )
}
