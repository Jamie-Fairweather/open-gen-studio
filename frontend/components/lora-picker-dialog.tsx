"use client"

import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import { CheckIcon, DownloadIcon, LayersIcon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { WithTooltip } from "@/components/ui/tooltip"
import { gallerySrc, type LoraPack } from "@/lib/host"
import { cn } from "@/lib/utils"

type LoraPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  packs: LoraPack[]
  /** When set, only packs with a variant for this arch are shown. */
  arch?: string | null
  /** Pack ids already on the generate stack. */
  selectedIds?: string[]
  installingKey?: string | null
  /** `id:arch` keys waiting in the download queue. */
  queuedKeys?: string[]
  onSelect: (id: string) => void
  onInstall: (id: string, arch: RecipeArch) => void
}

function variantForArch(pack: LoraPack, arch: string | null | undefined) {
  if (!arch) return pack.variants[0] ?? null
  return pack.variants.find((v) => v.arch === arch) ?? null
}

function isReadyForArch(pack: LoraPack, arch: string | null | undefined) {
  const v = variantForArch(pack, arch)
  return v?.ready ?? false
}

export function LoraPickerDialog({
  open,
  onOpenChange,
  packs,
  arch,
  selectedIds = [],
  installingKey,
  queuedKeys = [],
  onSelect,
  onInstall,
}: LoraPickerDialogProps) {
  const [query, setQuery] = useState("")

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const scoped = arch
      ? packs.filter((p) => p.variants.some((v) => v.arch === arch))
      : packs
    const filtered = q
      ? scoped.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.id.toLowerCase().includes(q) ||
            p.arches.some((a) => a.toLowerCase().includes(q))
        )
      : scoped

    return [...filtered].sort((a, b) => {
      const ar = isReadyForArch(a, arch) ? 0 : 1
      const br = isReadyForArch(b, arch) ? 0 : 1
      if (ar !== br) return ar - br
      return a.name.localeCompare(b.name)
    })
  }, [packs, arch, query])

  const mine = sorted.filter((p) => p.source === "user")
  const official = sorted.filter((p) => p.source !== "user")
  const officialReady = official.filter((p) => isReadyForArch(p, arch))
  const officialAvailable = official.filter((p) => !isReadyForArch(p, arch))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>LoRAs</DialogTitle>
          <DialogDescription>
            {arch
              ? `Packs for ${arch}. Add to your stack, or install files first.`
              : "Official packs plus your saves. Download progress lives in Downloads."}
          </DialogDescription>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl bg-muted/60 **:[input]:h-10 **:[input]:ps-9 **:[input]:leading-10 sm:**:[input]:h-10 sm:**:[input]:leading-10"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </DialogHeader>
        <DialogPanel className="max-h-[min(70vh,640px)]">
          {sorted.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {arch
                ? `No LoRA packs for ${arch}`
                : "No LoRA packs match your search"}
            </p>
          ) : (
            <div className="flex flex-col gap-8 pb-6">
              {mine.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    My LoRAs
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mine.map((pack) => (
                      <LoraCard
                        key={`user-${pack.id}`}
                        pack={pack}
                        arch={arch}
                        selected={selectedIds.includes(pack.id)}
                        installing={installingKey === `${pack.id}:${arch}`}
                        queued={queuedKeys.includes(`${pack.id}:${arch}`)}
                        onSelect={() => {
                          onSelect(pack.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => {
                          const a = arch ?? pack.arches[0]
                          if (a && isRecipeArch(a)) onInstall(pack.id, a)
                        }}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {officialReady.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Official · Ready
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {officialReady.map((pack) => (
                      <LoraCard
                        key={`official-${pack.id}`}
                        pack={pack}
                        arch={arch}
                        selected={selectedIds.includes(pack.id)}
                        installing={false}
                        queued={queuedKeys.includes(`${pack.id}:${arch}`)}
                        onSelect={() => {
                          onSelect(pack.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => {
                          const a = arch ?? pack.arches[0]
                          if (a && isRecipeArch(a)) onInstall(pack.id, a)
                        }}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {officialAvailable.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Official · Available
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {officialAvailable.map((pack) => (
                      <LoraCard
                        key={`official-${pack.id}`}
                        pack={pack}
                        arch={arch}
                        selected={selectedIds.includes(pack.id)}
                        installing={installingKey === `${pack.id}:${arch}`}
                        queued={queuedKeys.includes(`${pack.id}:${arch}`)}
                        onSelect={() => {
                          onSelect(pack.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => {
                          const a = arch ?? pack.arches[0]
                          if (a && isRecipeArch(a)) onInstall(pack.id, a)
                        }}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}

function LoraCard({
  pack,
  arch,
  selected,
  installing,
  queued,
  onSelect,
  onInstall,
}: {
  pack: LoraPack
  arch?: string | null
  selected: boolean
  installing: boolean
  queued: boolean
  onSelect: () => void
  onInstall: () => void
}) {
  const variant = variantForArch(pack, arch)
  const ready = variant?.ready ?? false
  const trigger = pack.triggerWords?.[0]
  const archLabel = arch
    ? arch
    : pack.arches.length <= 3
      ? pack.arches.join(", ")
      : `${pack.arches.length} arches`

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors",
        selected
          ? "border-primary ring-1 ring-primary/40"
          : "border-border hover:border-white/20"
      )}
    >
      <button
        type="button"
        className="group relative aspect-[4/3] w-full cursor-pointer overflow-hidden bg-muted text-left"
        onClick={onSelect}
      >
        {pack.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallerySrc(pack.thumbnailPath)}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <LayersIcon className="size-10 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-70" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 p-2">
          <Badge
            variant="secondary"
            className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
          >
            {archLabel}
          </Badge>
          {pack.source === "user" ? (
            <Badge
              variant="secondary"
              className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
            >
              Mine
            </Badge>
          ) : null}
          {ready ? (
            <Badge className="rounded-md bg-primary/90 text-[10px] text-primary-foreground">
              Ready
            </Badge>
          ) : null}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h4 className="truncate leading-tight font-medium">{pack.name}</h4>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {pack.description ||
              (trigger ? `Trigger: ${trigger}` : "LoRA pack")}
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {pack.variantsReady}/{pack.variantCount} files
          {variant?.filename ? ` · ${variant.filename}` : ""}
        </p>

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className="min-w-0 flex-1"
            onClick={onSelect}
          >
            {selected ? (
              <>
                <CheckIcon />
                In stack
              </>
            ) : (
              "Add"
            )}
          </Button>
          {installing ? (
            <Button type="button" size="sm" variant="outline" disabled>
              <Spinner className="size-3.5" />
              Downloading
            </Button>
          ) : queued ? (
            <WithTooltip label="Queued in Downloads">
              <Button type="button" size="sm" variant="outline" disabled>
                Queued
              </Button>
            </WithTooltip>
          ) : (
            <WithTooltip label={ready ? "Already on disk" : "Download file"}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onInstall}
                disabled={ready}
              >
                <DownloadIcon />
                {ready ? "Ready" : "Install"}
              </Button>
            </WithTooltip>
          )}
        </div>
      </div>
    </article>
  )
}
