"use client"

import { useEffect, useRef, useState } from "react"
import {
  CreatorThumbnailField,
  type PendingThumbnail,
} from "./creator-thumbnail-field"
import {
  STUDIO_PANEL_GUTTER,
  StudioPanelColumn,
  StudioPanelFooter,
} from "@/components/shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { RECIPE_ARCHES, isRecipeArch } from "@/lib/arch"
import {
  clearUserLoraThumbnail,
  expandCivitaiLoraUrl,
  getLora,
  resolveModelUrl,
  saveUserLora,
  setUserLoraThumbnail,
  type LoraPack,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"
import { PlusIcon, Trash2Icon } from "lucide-react"

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function looksLikeCivitai(url: string): boolean {
  const u = url.trim().toLowerCase()
  return u.includes("civitai.com") || u.includes("civitai.red")
}

type VariantRow = {
  key: string
  arch: string
  url: string
}

function newRow(partial?: Partial<VariantRow>): VariantRow {
  return {
    key: crypto.randomUUID(),
    arch: partial?.arch ?? RECIPE_ARCHES[0] ?? "krea2",
    url: partial?.url ?? "",
  }
}

type CreatorLoraFormProps = {
  editLoraId?: string | null
  onSaved: (pack: LoraPack) => void
  onDelete?: () => void
  onEditCleared?: () => void
}

export function CreatorLoraForm({
  editLoraId = null,
  onSaved,
  onDelete,
  onEditCleared,
}: CreatorLoraFormProps) {
  const [busy, setBusy] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(() => Boolean(editLoraId))
  const [expanding, setExpanding] = useState(false)
  const [name, setName] = useState("")
  const [idManual, setIdManual] = useState("")
  const [idTouched, setIdTouched] = useState(false)
  const [variants, setVariants] = useState<VariantRow[]>(() => [newRow()])
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null)
  const [pendingThumb, setPendingThumb] = useState<PendingThumbnail | null>(
    null
  )
  const lastExpandedUrl = useRef("")
  const editing = Boolean(editLoraId)
  const id = editing || idTouched ? idManual : slugify(name)

  useEffect(() => {
    if (!editLoraId) return
    let cancelled = false
    void getLora(editLoraId)
      .then((pack) => {
        if (cancelled) return
        setName(pack.name)
        setIdManual(pack.id)
        setIdTouched(true)
        setVariants(
          pack.variants.length > 0
            ? pack.variants.map((v) =>
                newRow({ arch: v.arch, url: v.url ?? "" })
              )
            : [newRow()]
        )
        setThumbnailPath(pack.thumbnailPath ?? null)
        lastExpandedUrl.current = ""
        setPendingThumb((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl)
          return null
        })
        setLoadingEdit(false)
      })
      .catch((e) => {
        if (cancelled) return
        notifyError(e instanceof Error ? e.message : String(e), "Load LoRA")
        setLoadingEdit(false)
        onEditCleared?.()
      })
    return () => {
      cancelled = true
    }
    // Parent remounts via key when switching create/edit targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEditCleared is error-path only
  }, [editLoraId])

  async function tryExpandFromUrl(raw: string) {
    const url = raw.trim()
    if (!url || !looksLikeCivitai(url) || url === lastExpandedUrl.current) {
      return
    }
    setExpanding(true)
    try {
      const expanded = await expandCivitaiLoraUrl(url)
      lastExpandedUrl.current = url
      setVariants(
        expanded.variants.map((v) => newRow({ arch: v.arch, url: v.url }))
      )
      if (!name.trim() && expanded.name.trim()) {
        setName(expanded.name.trim())
      }
      const archList = expanded.variants.map((v) => v.arch).join(", ")
      const skipped =
        expanded.skippedBaseModels.length > 0
          ? ` · skipped ${expanded.skippedBaseModels.join(", ")}`
          : ""
      notifySuccess(
        `Filled ${expanded.variants.length} arch${expanded.variants.length === 1 ? "" : "es"}`,
        `${archList}${skipped}`
      )
    } catch (e) {
      // Leave the row as-is; user may have pasted a direct download URL.
      if (/\/models\//i.test(url) || /modelVersionId=/i.test(url)) {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "CivitAI expand"
        )
      }
    } finally {
      setExpanding(false)
    }
  }

  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
    )
  }

  async function handleSave() {
    const trimmedName = name.trim()
    const trimmedId = id.trim()
    const filled = variants
      .map((v) => ({
        arch: v.arch.trim(),
        url: v.url.trim(),
      }))
      .filter((v) => v.url.length > 0)

    if (!trimmedName || !trimmedId) {
      notifyError("Name is required", "Save LoRA")
      return
    }
    if (filled.length === 0) {
      notifyError("Add at least one architecture URL", "Save LoRA")
      return
    }
    const arches = filled.map((v) => v.arch)
    if (new Set(arches).size !== arches.length) {
      notifyError("Each architecture can only appear once", "Save LoRA")
      return
    }

    setBusy(true)
    try {
      const resolvedVariants = await Promise.all(
        filled.map(async (v) => {
          const resolved = await resolveModelUrl(v.url)
          const filename =
            resolved.filename?.trim() || `${trimmedId}-${v.arch}.safetensors`
          return {
            arch: v.arch,
            filename,
            path: "loras",
            url: resolved.downloadUrl || v.url,
          }
        })
      )
      let pack = await saveUserLora({
        id: trimmedId,
        name: trimmedName,
        variants: resolvedVariants,
      })
      if (pendingThumb) {
        const path = await setUserLoraThumbnail(
          trimmedId,
          pendingThumb.bytes,
          pendingThumb.ext
        )
        URL.revokeObjectURL(pendingThumb.previewUrl)
        setPendingThumb(null)
        setThumbnailPath(path)
        pack = { ...pack, thumbnailPath: path }
      }
      notifySuccess("LoRA pack saved", trimmedName)
      onSaved(pack)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Save LoRA")
    } finally {
      setBusy(false)
    }
  }

  const usedArches = new Set(variants.map((v) => v.arch))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className={cn("py-4", STUDIO_PANEL_GUTTER)}>
          <StudioPanelColumn className="gap-4">
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

            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  Architectures
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Paste a CivitAI model link to auto-fill
                </p>
              </div>

              <div className="space-y-2">
                {variants.map((row, index) => (
                  <div
                    key={row.key}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center"
                  >
                    <select
                      className="flex h-9 w-full shrink-0 rounded-lg border border-input bg-background px-3 text-sm sm:w-36"
                      value={row.arch}
                      disabled={loadingEdit || expanding}
                      onChange={(e) =>
                        updateVariant(row.key, { arch: e.target.value })
                      }
                    >
                      {RECIPE_ARCHES.map((a) => (
                        <option
                          key={a}
                          value={a}
                          disabled={usedArches.has(a) && a !== row.arch}
                        >
                          {a}
                        </option>
                      ))}
                      {!isRecipeArch(row.arch) ? (
                        <option value={row.arch}>{row.arch}</option>
                      ) : null}
                    </select>
                    <Input
                      placeholder={
                        index === 0
                          ? "CivitAI model / download URL"
                          : "Download URL"
                      }
                      value={row.url}
                      disabled={loadingEdit || expanding}
                      onChange={(e) =>
                        updateVariant(row.key, { url: e.target.value })
                      }
                      onPaste={(e) => {
                        if (index !== 0) return
                        const pasted = e.clipboardData.getData("text")
                        if (looksLikeCivitai(pasted)) {
                          window.setTimeout(() => {
                            void tryExpandFromUrl(pasted)
                          }, 0)
                        }
                      }}
                      onBlur={() => {
                        if (index === 0) void tryExpandFromUrl(row.url)
                      }}
                      className="min-w-0 flex-1 font-mono text-sm"
                    />
                    {variants.length > 1 ? (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="outline"
                        disabled={busy || loadingEdit || expanding}
                        aria-label="Remove architecture"
                        onClick={() =>
                          setVariants((rows) =>
                            rows.filter((r) => r.key !== row.key)
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  busy ||
                  loadingEdit ||
                  expanding ||
                  variants.length >= RECIPE_ARCHES.length
                }
                onClick={() => {
                  const nextArch =
                    RECIPE_ARCHES.find((a) => !usedArches.has(a)) ??
                    RECIPE_ARCHES[0] ??
                    "krea2"
                  setVariants((rows) => [...rows, newRow({ arch: nextArch })])
                }}
              >
                <PlusIcon className="size-3.5" />
                Add architecture
              </Button>
            </section>
          </StudioPanelColumn>
        </div>
      </ScrollArea>

      <StudioPanelFooter>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {loadingEdit
            ? "Loading LoRA…"
            : expanding
              ? "Reading CivitAI model…"
              : editing
                ? `Editing · My LoRAs/${editLoraId}`
                : `New · My LoRAs/${id || "…"}`}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {editing && onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || loadingEdit || expanding}
              className="text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || loadingEdit || expanding}
            onClick={() => void handleSave()}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Save LoRA"}
          </Button>
        </div>
      </StudioPanelFooter>
    </div>
  )
}
