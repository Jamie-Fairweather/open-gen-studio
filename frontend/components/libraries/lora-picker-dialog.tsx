"use client"

import { isRecipeArch, type RecipeArch } from "@/lib/arch"
import {
  CheckIcon,
  DownloadIcon,
  LayersIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import {
  catalogInstallLabel,
  catalogOriginLabel,
} from "@/lib/blueprint-helpers"
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
  onUninstall: (id: string, arch: RecipeArch) => void
}

function variantForArch(pack: LoraPack, arch: string | null | undefined) {
  if (!arch) return pack.variants[0] ?? null
  return pack.variants.find((v) => v.arch === arch) ?? null
}

function isReadyForArch(pack: LoraPack, arch: string | null | undefined) {
  const v = variantForArch(pack, arch)
  return v?.ready ?? false
}

/** Catalog picker scoped to an arch: add to stack or install/uninstall files. */
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
  onUninstall,
}: LoraPickerDialogProps) {
  const [query, setQuery] = useState("")
  const [pendingUninstall, setPendingUninstall] = useState<{
    id: string
    name: string
    arch: RecipeArch
  } | null>(null)

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

    return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  }, [packs, arch, query])

  const installed = sorted.filter((p) => isReadyForArch(p, arch))
  const notInstalled = sorted.filter((p) => !isReadyForArch(p, arch))

  const renderCard = (pack: LoraPack) => {
    const a = arch ?? pack.arches[0]
    return (
      <LoraCard
        key={pack.id}
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
          if (a && isRecipeArch(a)) onInstall(pack.id, a)
        }}
        onRequestUninstall={() => {
          if (a && isRecipeArch(a)) {
            setPendingUninstall({
              id: pack.id,
              name: pack.name,
              arch: a,
            })
          }
        }}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>LoRAs</DialogTitle>
          <DialogDescription>
            {arch
              ? `Packs for ${arch}. Add to your stack, or install files first.`
              : "Catalog LoRAs, split by installed. Official and Mine are pills. Progress lives in Downloads."}
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
              <LoraGridSection title={catalogInstallLabel(true)}>
                {installed.map(renderCard)}
              </LoraGridSection>
              <LoraGridSection title={catalogInstallLabel(false)}>
                {notInstalled.map(renderCard)}
              </LoraGridSection>
            </div>
          )}
        </DialogPanel>
      </DialogPopup>

      <AlertDialog
        open={pendingUninstall != null}
        onOpenChange={(next) => {
          if (!next) setPendingUninstall(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Uninstall LoRA?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove the{" "}
              <span className="font-medium text-foreground">
                {pendingUninstall?.arch}
              </span>{" "}
              weight file for{" "}
              <span className="font-medium text-foreground">
                {pendingUninstall?.name}
              </span>
              . Files still used by other installed LoRAs are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => {
                if (pendingUninstall) {
                  onUninstall(pendingUninstall.id, pendingUninstall.arch)
                }
                setPendingUninstall(null)
              }}
            >
              Uninstall
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </Dialog>
  )
}

function LoraGridSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  if (Array.isArray(children) && children.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
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
  onRequestUninstall,
}: {
  pack: LoraPack
  arch?: string | null
  selected: boolean
  installing: boolean
  queued: boolean
  onSelect: () => void
  onInstall: () => void
  onRequestUninstall: () => void
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
          <Badge
            variant="secondary"
            className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
          >
            {catalogOriginLabel(pack.source)}
          </Badge>
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
          ) : ready ? (
            <WithTooltip label="Remove weight file if unused">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onRequestUninstall}
              >
                <Trash2Icon />
                Uninstall
              </Button>
            </WithTooltip>
          ) : (
            <WithTooltip label="Download file">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onInstall}
              >
                <DownloadIcon />
                Install
              </Button>
            </WithTooltip>
          )}
        </div>
      </div>
    </article>
  )
}
