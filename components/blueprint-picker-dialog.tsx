"use client"

import {
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  KeyRoundIcon,
  PencilIcon,
  SearchIcon,
} from "lucide-react"
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
import { isInstalled } from "@/lib/blueprint-helpers"
import { formatBytes } from "@/lib/format"
import { gallerySrc, type Blueprint } from "@/lib/host"
import { cn } from "@/lib/utils"

export type BlueprintInstallProgress = {
  blueprintId: string
  stage: string
  message: string
  modelIndex: number
  modelTotal: number
  filename?: string | null
  /** Current file bytes (not whole-blueprint). */
  downloaded: number
  total: number | null
  bytesPerSec: number
}

/** One pending model file in the Downloads queue. */
export type DownloadModelItem = {
  blueprintId: string
  blueprintName: string
  filename: string
  path: string
  role?: string
}

type BlueprintPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blueprints: Blueprint[]
  selectedId: string | null
  installingId: string | null
  queuedIds?: string[]
  sizesProbing: boolean
  onSelect: (id: string) => void
  onInstall: (id: string) => void
  /** Open Creator with this user blueprint loaded for editing. */
  onEdit?: (id: string) => void
}

export function BlueprintPickerDialog({
  open,
  onOpenChange,
  blueprints,
  selectedId,
  installingId,
  queuedIds = [],
  sizesProbing,
  onSelect,
  onInstall,
  onEdit,
}: BlueprintPickerDialogProps) {
  const [query, setQuery] = useState("")

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? blueprints.filter(
          (bp) =>
            bp.name.toLowerCase().includes(q) ||
            bp.description.toLowerCase().includes(q) ||
            bp.category.toLowerCase().includes(q) ||
            bp.id.toLowerCase().includes(q)
        )
      : blueprints

    return [...filtered].sort((a, b) => {
      const ai = isInstalled(a) ? 0 : 1
      const bi = isInstalled(b) ? 0 : 1
      if (ai !== bi) return ai - bi
      return a.name.localeCompare(b.name)
    })
  }, [blueprints, query])

  const mine = sorted.filter((bp) => bp.source === "user")
  const official = sorted.filter((bp) => bp.source !== "user")
  const officialInstalled = official.filter(isInstalled)
  const officialAvailable = official.filter((bp) => !isInstalled(bp))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Blueprints</DialogTitle>
          <DialogDescription>
            Official packs plus your Creator saves. Installed appear first.
            Download progress lives in Downloads.
          </DialogDescription>
          <div className="relative mt-2">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 rounded-xl bg-muted/60 pl-9"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </DialogHeader>
        <DialogPanel className="max-h-[min(70vh,640px)]">
          {sorted.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No blueprints match your search
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {mine.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    My blueprints
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mine.map((bp) => (
                      <BlueprintCard
                        key={`user-${bp.id}`}
                        bp={bp}
                        selected={selectedId === bp.id}
                        installing={installingId === bp.id}
                        queued={queuedIds.includes(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => {
                          onSelect(bp.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => onInstall(bp.id)}
                        onEdit={
                          onEdit
                            ? () => {
                                onEdit(bp.id)
                                onOpenChange(false)
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {officialInstalled.length > 0 ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Official · Installed
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {officialInstalled.map((bp) => (
                      <BlueprintCard
                        key={`official-${bp.id}`}
                        bp={bp}
                        selected={selectedId === bp.id}
                        installing={installingId === bp.id}
                        queued={queuedIds.includes(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => {
                          onSelect(bp.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => onInstall(bp.id)}
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
                    {officialAvailable.map((bp) => (
                      <BlueprintCard
                        key={`official-${bp.id}`}
                        bp={bp}
                        selected={selectedId === bp.id}
                        installing={installingId === bp.id}
                        queued={queuedIds.includes(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => onSelect(bp.id)}
                        onInstall={() => onInstall(bp.id)}
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

function BlueprintCard({
  bp,
  selected,
  installing,
  queued,
  sizesProbing,
  onSelect,
  onInstall,
  onEdit,
}: {
  bp: Blueprint
  selected: boolean
  installing: boolean
  queued: boolean
  sizesProbing: boolean
  onSelect: () => void
  onInstall: () => void
  onEdit?: () => void
}) {
  const installed = isInstalled(bp)
  const sizeTotal = bp.totalSizeBytes
  const sizeLocal = bp.localSizeBytes
  const sizeLabel =
    sizeTotal != null
      ? `${formatBytes(sizeLocal)} / ${formatBytes(sizeTotal)}`
      : sizesProbing
        ? "checking size…"
        : sizeLocal > 0
          ? `${formatBytes(sizeLocal)} on disk`
          : null

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
        {bp.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={gallerySrc(bp.thumbnailPath)}
            alt=""
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <ImageIcon className="size-10 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-70" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1.5 p-2">
          <Badge
            variant="secondary"
            className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
          >
            {bp.category}
          </Badge>
          {bp.source === "user" ? (
            <Badge
              variant="secondary"
              className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
            >
              Mine
            </Badge>
          ) : null}
          {installed ? (
            <Badge className="rounded-md bg-primary/90 text-[10px] text-primary-foreground">
              Installed
            </Badge>
          ) : null}
          {bp.requiresHfToken ? (
            <WithTooltip label="Requires a Hugging Face token in Settings">
              <Badge
                variant="warning"
                className="rounded-md text-[10px] backdrop-blur-sm"
              >
                <KeyRoundIcon className="size-3" />
                HF token
              </Badge>
            </WithTooltip>
          ) : null}
          {bp.requiresCivitaiToken ? (
            <WithTooltip label="Requires a CivitAI API key in Settings">
              <Badge
                variant="warning"
                className="rounded-md text-[10px] backdrop-blur-sm"
              >
                <KeyRoundIcon className="size-3" />
                CivitAI
              </Badge>
            </WithTooltip>
          ) : null}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 truncate leading-tight font-medium">
            {bp.requiresHfToken || bp.requiresCivitaiToken ? (
              <KeyRoundIcon
                className="size-3.5 shrink-0 text-amber-500"
                aria-label={
                  bp.requiresHfToken && bp.requiresCivitaiToken
                    ? "Requires Hugging Face and CivitAI tokens"
                    : bp.requiresCivitaiToken
                      ? "Requires CivitAI API key"
                      : "Requires Hugging Face token"
                }
              />
            ) : null}
            <span className="truncate">{bp.name}</span>
          </h4>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {bp.description || `${bp.runtime} blueprint`}
          </p>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {bp.modelsReady}/{bp.modelCount} models
          {sizeLabel ? ` · ${sizeLabel}` : ""}
          {bp.minimumVramGb != null ? ` · ≥${bp.minimumVramGb} GB` : ""}
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
                Selected
              </>
            ) : (
              "Select"
            )}
          </Button>
          {onEdit ? (
            <WithTooltip label="Edit in Creator">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onEdit}
              >
                <PencilIcon />
                Edit
              </Button>
            </WithTooltip>
          ) : null}
          {installing ? (
            <WithTooltip label="Downloading models">
              <Button type="button" size="sm" variant="outline" disabled>
                <Spinner className="size-3.5" />
                Downloading
              </Button>
            </WithTooltip>
          ) : queued ? (
            <WithTooltip label="Queued in Downloads">
              <Button type="button" size="sm" variant="outline" disabled>
                Queued
              </Button>
            </WithTooltip>
          ) : (
            <WithTooltip
              label={installed ? "Re-check models" : "Download models"}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onInstall}
              >
                <DownloadIcon />
                {installed
                  ? "Check"
                  : bp.modelsReady > 0
                    ? "Resume"
                    : "Install"}
              </Button>
            </WithTooltip>
          )}
        </div>
      </div>
    </article>
  )
}
