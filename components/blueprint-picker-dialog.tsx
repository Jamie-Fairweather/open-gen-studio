"use client"

import {
  CheckIcon,
  DownloadIcon,
  ImageIcon,
  KeyRoundIcon,
  SearchIcon,
  XIcon,
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
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress"
import { gallerySrc, type Blueprint } from "@/lib/host"
import { cn } from "@/lib/utils"

export type BlueprintInstallProgress = {
  blueprintId: string
  stage: string
  message: string
  modelIndex: number
  modelTotal: number
  downloaded: number
  total: number | null
  bytesPerSec: number
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "—"
  if (secs < 60) return `${Math.max(1, Math.ceil(secs))}s`
  const m = Math.floor(secs / 60)
  const s = Math.ceil(secs % 60)
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
}

function isInstalled(bp: Blueprint): boolean {
  return bp.modelCount === 0 || bp.modelsReady >= bp.modelCount
}

type BlueprintPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blueprints: Blueprint[]
  selectedId: string | null
  installingId: string | null
  installProgress: BlueprintInstallProgress | null
  sizesProbing: boolean
  onSelect: (id: string) => void
  onInstall: (id: string) => void
  onCancelInstall?: () => void
}

export function BlueprintPickerDialog({
  open,
  onOpenChange,
  blueprints,
  selectedId,
  installingId,
  installProgress,
  sizesProbing,
  onSelect,
  onInstall,
  onCancelInstall,
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

  function cardProgress(bpId: string): BlueprintInstallProgress | null {
    if (installingId !== bpId) return null
    if (installProgress?.blueprintId === bpId) return installProgress
    return {
      blueprintId: bpId,
      stage: "start",
      message: "Starting…",
      modelIndex: 0,
      modelTotal: 0,
      downloaded: 0,
      total: null,
      bytesPerSec: 0,
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-5xl sm:max-w-5xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Blueprints</DialogTitle>
          <DialogDescription>
            Official packs plus your Creator saves. Installed appear first.
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
                        progress={cardProgress(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => {
                          onSelect(bp.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => onInstall(bp.id)}
                        onCancelInstall={onCancelInstall}
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
                        progress={cardProgress(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => {
                          onSelect(bp.id)
                          onOpenChange(false)
                        }}
                        onInstall={() => onInstall(bp.id)}
                        onCancelInstall={onCancelInstall}
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
                        progress={cardProgress(bp.id)}
                        sizesProbing={sizesProbing}
                        onSelect={() => onSelect(bp.id)}
                        onInstall={() => onInstall(bp.id)}
                        onCancelInstall={onCancelInstall}
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
  progress,
  sizesProbing,
  onSelect,
  onInstall,
  onCancelInstall,
}: {
  bp: Blueprint
  selected: boolean
  installing: boolean
  progress: BlueprintInstallProgress | null
  sizesProbing: boolean
  onSelect: () => void
  onInstall: () => void
  onCancelInstall?: () => void
}) {
  const installed = isInstalled(bp)
  // During install, prefer live overall bytes so this line matches the progress box.
  const sizeTotal =
    progress?.total != null && progress.total > 0
      ? progress.total
      : bp.totalSizeBytes
  const sizeLocal = progress != null ? progress.downloaded : bp.localSizeBytes
  const sizeLabel =
    sizeTotal != null
      ? `${formatBytes(sizeLocal)} / ${formatBytes(sizeTotal)}`
      : sizesProbing
        ? "checking size…"
        : sizeLocal > 0
          ? `${formatBytes(sizeLocal)} on disk`
          : null

  const filePct =
    progress?.total != null && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null
  const modelPct =
    progress && progress.modelTotal > 0
      ? Math.min(
          100,
          Math.round((progress.modelIndex / progress.modelTotal) * 100)
        )
      : null
  const barValue = filePct ?? modelPct ?? (installing ? 0 : null)
  const etaSecs =
    progress &&
    progress.total != null &&
    progress.total > progress.downloaded &&
    progress.bytesPerSec > 8 * 1024
      ? (progress.total - progress.downloaded) / progress.bytesPerSec
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
            <Badge
              variant="warning"
              className="rounded-md text-[10px] backdrop-blur-sm"
              title="Requires a Hugging Face token in Settings"
            >
              <KeyRoundIcon className="size-3" />
              HF token
            </Badge>
          ) : null}
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-1.5 truncate leading-tight font-medium">
            {bp.requiresHfToken ? (
              <KeyRoundIcon
                className="size-3.5 shrink-0 text-amber-500"
                aria-label="Requires Hugging Face token"
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

        {progress ? (
          <div className="min-h-[4.5rem] space-y-1.5 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2">
            <Progress value={barValue ?? 0}>
              <ProgressTrack>
                <ProgressIndicator />
              </ProgressTrack>
            </Progress>
            <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
              <span className="truncate">
                {progress.total != null
                  ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
                  : progress.downloaded > 0
                    ? formatBytes(progress.downloaded)
                    : "Preparing…"}
              </span>
              <span className="w-8 text-right">
                {filePct != null ? `${filePct}%` : "—"}
              </span>
              <span className="col-span-2 truncate">
                {progress.bytesPerSec > 8 * 1024
                  ? `${formatBytes(progress.bytesPerSec)}/s`
                  : "—"}
                {" · ETA "}
                {etaSecs != null ? formatDuration(etaSecs) : "—"}
              </span>
              <span className="col-span-2 truncate" title={progress.message}>
                {progress.modelTotal > 0
                  ? `Model ${progress.modelIndex}/${progress.modelTotal}`
                  : null}
                {progress.modelTotal > 0 && progress.message ? " · " : null}
                {progress.message}
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant={selected ? "default" : "outline"}
            className="flex-1"
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
          {installing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onCancelInstall}
              title="Cancel download"
            >
              <XIcon />
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onInstall}
              title={installed ? "Re-check models" : "Download models"}
            >
              <DownloadIcon />
              {installed ? "Check" : bp.modelsReady > 0 ? "Resume" : "Install"}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
