"use client"

import { useEffect, useMemo, useState } from "react"
import type { PendingThumbnail } from "./creator-thumbnail-field"
import {
  draftsForArch,
  filenameFromUrl,
  needsProviderResolve,
  slugify,
  type ModelDraft,
} from "./recipe-form-helpers"
import {
  getBlueprint,
  resolveModelUrl,
  saveUserBlueprint,
  setUserBlueprintThumbnail,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { ARCHES, isArchId, type ArchId } from "@/lib/creator-arches"

export type UseRecipeBlueprintFormArgs = {
  onSaved: (id: string) => void
  editBlueprintId?: string | null
  onEditCleared?: () => void
}

export function useRecipeBlueprintForm({
  onSaved,
  editBlueprintId = null,
  onEditCleared,
}: UseRecipeBlueprintFormArgs) {
  const [busy, setBusy] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(() => Boolean(editBlueprintId))
  const [name, setName] = useState("")
  const [idManual, setIdManual] = useState("")
  const [idTouched, setIdTouched] = useState(false)
  const [description, setDescription] = useState("")
  const [archId, setArchId] = useState<ArchId>("z-image")
  const [sampler, setSampler] = useState(ARCHES[0].sampler)
  const [scheduler, setScheduler] = useState(ARCHES[0].scheduler)
  const [models, setModels] = useState<ModelDraft[]>(() =>
    draftsForArch(ARCHES[0])
  )
  const [steps, setSteps] = useState(ARCHES[0].defaults.steps)
  const [cfg, setCfg] = useState(ARCHES[0].defaults.cfg)
  const [guidance, setGuidance] = useState(ARCHES[0].defaults.guidance ?? 3.5)
  const [allowNegative, setAllowNegative] = useState(
    ARCHES[0].capabilities.negative
  )
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null)
  const [pendingThumb, setPendingThumb] = useState<PendingThumbnail | null>(
    null
  )
  const editing = Boolean(editBlueprintId)

  const arch = useMemo(
    () => ARCHES.find((a) => a.id === archId) ?? ARCHES[0],
    [archId]
  )
  const id = editing || idTouched ? idManual : slugify(name)

  function applyArch(nextId: ArchId) {
    const next = ARCHES.find((a) => a.id === nextId) ?? ARCHES[0]
    setArchId(next.id)
    setSampler(next.sampler)
    setScheduler(next.scheduler)
    setModels(draftsForArch(next))
    setSteps(next.defaults.steps)
    setCfg(next.defaults.cfg)
    setGuidance(next.defaults.guidance ?? 3.5)
    setAllowNegative(next.capabilities.negative)
  }

  useEffect(() => {
    if (!editBlueprintId) return
    let cancelled = false
    void getBlueprint(editBlueprintId)
      .then((detail) => {
        if (cancelled) return
        const nextArch: ArchId = isArchId(detail.arch ?? "")
          ? (detail.arch as ArchId)
          : "z-image"
        const archDef = ARCHES.find((a) => a.id === nextArch) ?? ARCHES[0]
        setName(detail.name)
        setIdManual(detail.id)
        setIdTouched(true)
        setDescription(detail.description ?? "")
        setArchId(nextArch)
        setSampler(detail.sampler?.trim() || archDef.sampler)
        setScheduler(detail.scheduler?.trim() || archDef.scheduler)
        setAllowNegative(
          detail.capabilities?.negative ?? archDef.capabilities.negative
        )

        const defaults = detail.defaults ?? {}
        const stepsVal = Number(defaults.steps)
        setSteps(Number.isFinite(stepsVal) ? stepsVal : archDef.defaults.steps)
        const cfgVal = Number(defaults.cfg)
        setCfg(Number.isFinite(cfgVal) ? cfgVal : archDef.defaults.cfg)
        const guidanceVal = Number(defaults.guidance)
        setGuidance(
          Number.isFinite(guidanceVal)
            ? guidanceVal
            : (archDef.defaults.guidance ?? 3.5)
        )

        const byRole = new Map(
          (detail.models ?? []).map((m) => [m.role || "", m])
        )
        setModels(
          archDef.slots.map((slot) => {
            const entry = byRole.get(slot.role)
            if (entry) {
              return {
                role: slot.role,
                path: entry.path || slot.path,
                filename: entry.filename ?? "",
                url: entry.url ?? "",
              }
            }
            const url = slot.defaultUrl ?? ""
            return {
              role: slot.role,
              path: slot.path,
              filename: filenameFromUrl(url),
              url,
            }
          })
        )
        setThumbnailPath(detail.thumbnailPath ?? null)
        setPendingThumb((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl)
          return null
        })
      })
      .catch((e) => {
        if (!cancelled) {
          notifyError(
            e instanceof Error ? e.message : String(e),
            "Could not load blueprint"
          )
          onEditCleared?.()
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false)
      })
    return () => {
      cancelled = true
    }
    // Intentionally only re-load when the target id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onEditCleared is error-path only
  }, [editBlueprintId])

  function updateModelUrl(index: number, url: string) {
    const guessed = filenameFromUrl(url)
    const filename =
      needsProviderResolve(url) && !guessed.includes(".") ? "" : guessed
    setModels((prev) => {
      const next = [...prev]
      next[index] = {
        ...next[index],
        url,
        filename,
      }
      return next
    })
  }

  async function resolveModelRow(index: number, url: string) {
    const trimmed = url.trim()
    if (!trimmed || !needsProviderResolve(trimmed)) return
    try {
      const resolved = await resolveModelUrl(trimmed)
      setModels((prev) => {
        const next = [...prev]
        if (next[index]?.url.trim() !== trimmed) return prev
        next[index] = {
          ...next[index],
          filename: resolved.filename?.trim() || next[index].filename,
        }
        return next
      })
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not resolve model URL"
      )
    }
  }

  async function handleSave() {
    const trimmedId = id.trim()
    if (!trimmedId || !name.trim()) {
      notifyError("Name and id are required")
      return
    }

    // Resolve provider page URLs (CivitAI, …) so filenames are real file names.
    const resolvedFilenames = new Map<string, string>()
    for (const m of models) {
      const url = m.url.trim()
      if (!url || !needsProviderResolve(url)) continue
      const existing = m.filename.trim()
      if (existing.includes(".")) {
        resolvedFilenames.set(url, existing)
        continue
      }
      try {
        const resolved = await resolveModelUrl(url)
        if (resolved.filename?.trim()) {
          resolvedFilenames.set(url, resolved.filename.trim())
        }
      } catch (e) {
        notifyError(
          e instanceof Error ? e.message : String(e),
          "Could not resolve model URL"
        )
        return
      }
    }

    for (const slot of arch.slots) {
      const row = models.find((m) => m.role === slot.role)
      const url = row?.url.trim() ?? ""
      const filename =
        resolvedFilenames.get(url) ||
        row?.filename.trim() ||
        filenameFromUrl(url)
      if (slot.required) {
        if (!url) {
          notifyError(`${slot.label} needs a download URL`)
          return
        }
        if (!filename || filename.includes("/") || filename.includes("\\")) {
          notifyError(
            `${slot.label}: could not read a filename from the URL - use a direct file link or a CivitAI model page with a version selected`
          )
          return
        }
      } else if (url && !filename) {
        notifyError(
          `${slot.label}: could not read a filename from the URL - use a direct file link or a CivitAI model page`
        )
        return
      }
    }

    const modelEntries = models
      .map((m) => {
        const url = m.url.trim()
        return {
          role: m.role,
          filename:
            resolvedFilenames.get(url) ||
            m.filename.trim() ||
            filenameFromUrl(m.url),
          path: m.path,
          url,
          gated: false,
        }
      })
      .filter((m) => m.url && m.filename)

    // Size/seed are product defaults (arch size, seed always random=0) - not authorable here.
    const defaults: Record<string, unknown> = {
      width: arch.defaults.width,
      height: arch.defaults.height,
      steps,
      seed: 0,
    }
    if (arch.usesGuidance) {
      defaults.guidance = guidance
      defaults.cfg = 1
    } else {
      defaults.cfg = cfg
    }
    if (arch.defaults.clipType) defaults.clipType = arch.defaults.clipType
    if (arch.defaults.auraShift != null) {
      defaults.auraShift = arch.defaults.auraShift
    }
    if (arch.defaults.sd3Shift != null) {
      defaults.sd3Shift = arch.defaults.sd3Shift
    }
    if (arch.defaults.weightDtype) {
      defaults.weightDtype = arch.defaults.weightDtype
    }
    if (arch.defaults.mu != null) defaults.mu = arch.defaults.mu
    if (arch.defaults.std != null) defaults.std = arch.defaults.std
    if (arch.defaults.cfgOverride != null) {
      defaults.cfgOverride = arch.defaults.cfgOverride
    }
    if (arch.defaults.cfgOverrideStart != null) {
      defaults.cfgOverrideStart = arch.defaults.cfgOverrideStart
    }
    if (arch.defaults.cfgOverrideEnd != null) {
      defaults.cfgOverrideEnd = arch.defaults.cfgOverrideEnd
    }

    setBusy(true)
    try {
      await saveUserBlueprint({
        id: trimmedId,
        name: name.trim(),
        category: "image",
        description: description.trim(),
        runtime: "comfyui",
        flowType: "txt2img",
        arch: arch.id,
        sampler: sampler.trim() || arch.sampler,
        scheduler: scheduler.trim() || arch.scheduler,
        capabilities: {
          ...arch.capabilities,
          negative: arch.capabilities.negative ? allowNegative : false,
        },
        defaults,
        models: modelEntries,
      })
      if (pendingThumb) {
        const path = await setUserBlueprintThumbnail(
          trimmedId,
          pendingThumb.bytes,
          pendingThumb.ext
        )
        URL.revokeObjectURL(pendingThumb.previewUrl)
        setPendingThumb(null)
        setThumbnailPath(path)
      }
      notifySuccess(
        editing ? "Blueprint updated" : "Blueprint saved",
        trimmedId
      )
      onSaved(trimmedId)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const missingSlots = arch.slots.filter((slot) => {
    if (!slot.required) return false
    const row = models.find((m) => m.role === slot.role)
    return !(
      row?.url.trim() &&
      (row.filename.trim() || filenameFromUrl(row.url))
    )
  })
  const footerStatus = (() => {
    const parts: string[] = [arch.label]
    if (name.trim()) {
      parts.push(`My blueprints/${id || "…"}`)
    } else {
      parts.push("needs a name")
    }
    if (missingSlots.length > 0) {
      parts.push(
        `${missingSlots.length} model${missingSlots.length === 1 ? "" : "s"} missing`
      )
    } else {
      parts.push("models ready")
    }
    return parts.join(" · ")
  })()

  return {
    busy,
    loadingEdit,
    editing,
    name,
    setName,
    id,
    setIdManual,
    setIdTouched,
    description,
    setDescription,
    archId,
    applyArch,
    arch,
    sampler,
    setSampler,
    scheduler,
    setScheduler,
    models,
    updateModelUrl,
    resolveModelRow,
    steps,
    setSteps,
    cfg,
    setCfg,
    guidance,
    setGuidance,
    allowNegative,
    setAllowNegative,
    thumbnailPath,
    setThumbnailPath,
    pendingThumb,
    setPendingThumb,
    handleSave,
    footerStatus,
    missingSlots,
  }
}
