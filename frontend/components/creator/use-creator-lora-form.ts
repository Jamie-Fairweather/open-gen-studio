"use client"

import { useEffect, useRef, useState } from "react"
import type { PendingThumbnail } from "./creator-thumbnail-field"
import {
  looksLikeCivitai,
  newRow,
  slugify,
  type VariantRow,
} from "./creator-lora-helpers"
import {
  expandCivitaiLoraUrl,
  getLora,
  resolveModelUrl,
  saveUserLora,
  setUserLoraThumbnail,
  type LoraPack,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

export type UseCreatorLoraFormArgs = {
  editLoraId?: string | null
  onSaved: (pack: LoraPack) => void
  onEditCleared?: () => void
}

export function useCreatorLoraForm({
  editLoraId = null,
  onSaved,
  onEditCleared,
}: UseCreatorLoraFormArgs) {
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

  return {
    busy,
    loadingEdit,
    expanding,
    editing,
    name,
    setName,
    id,
    setIdTouched,
    setIdManual,
    variants,
    setVariants,
    thumbnailPath,
    setThumbnailPath,
    pendingThumb,
    setPendingThumb,
    usedArches,
    tryExpandFromUrl,
    updateVariant,
    handleSave,
  }
}
