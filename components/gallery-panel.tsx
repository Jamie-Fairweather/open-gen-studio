"use client"

import { RotateCcwIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  SideRail,
  SideRailBody,
  SideRailHeader,
  SIDE_RAIL_WIDTH,
} from "@/components/side-rail"
import { Button } from "@/components/ui/button"
import { gallerySrc, parseGalleryRecipe, type GalleryItem } from "@/lib/host"
import { cn } from "@/lib/utils"

type GalleryPanelProps = {
  open: boolean
  title?: string
  items: GalleryItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void>
  onReuse: (item: GalleryItem) => void
}

export function GalleryPanel({
  open,
  title = "Gallery",
  items,
  selectedId,
  onSelect,
  onDelete,
  onReuse,
}: GalleryPanelProps) {
  const [deleting, setDeleting] = useState(false)

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId]
  )

  useEffect(() => {
    if (!open) return
    if (selectedId && items.some((item) => item.id === selectedId)) return
    if (items[0]) onSelect(items[0].id)
  }, [open, items, selectedId, onSelect])

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
              const canReuse = parseGalleryRecipe(item) != null
              return (
                <div
                  key={item.id}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-lg bg-black/45",
                    !isSelected && "hover:brightness-110"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="absolute inset-0 outline-none"
                    aria-label="Select image"
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
                  {canReuse ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="absolute start-1.5 bottom-1.5 z-20 h-7 gap-1 rounded-full px-2.5 text-[11px] font-semibold opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => onReuse(item)}
                      aria-label="Reuse settings"
                      title="Reuse settings"
                    >
                      <RotateCcwIcon className="size-3.5" />
                      Reuse
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    className="absolute end-1.5 top-1.5 z-20 rounded-md opacity-0 shadow-md transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    disabled={deleting}
                    onClick={() => void handleDeleteFor(item.id)}
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </SideRailBody>
    </SideRail>
  )
}
