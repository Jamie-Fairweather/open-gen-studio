"use client"

import { useEffect, useMemo, useState } from "react"
import {
  STUDIO_PANEL_GUTTER,
  StudioPanelColumn,
  StudioPanelFooter,
} from "@/components/studio-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  COMFY_SAMPLER_ITEMS,
  COMFY_SCHEDULER_ITEMS,
} from "@/lib/comfy-samplers"
import {
  getBlueprint,
  resolveModelUrl,
  saveUserBlueprint,
  type RecipeCapabilities,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

type ArchId = "z-image" | "krea2" | "flux" | "flux2" | "sdxl" | "sd15"

type ModelSlotDef = {
  role: string
  path: string
  label: string
  required: boolean
  /** Stock companion URL prefilled when this arch is selected. */
  defaultUrl?: string
}

type ArchDef = {
  id: ArchId
  label: string
  slots: ModelSlotDef[]
  sampler: string
  scheduler: string
  capabilities: RecipeCapabilities
  /** Flux uses distilled guidance instead of CFG. */
  usesGuidance?: boolean
  defaults: {
    width: number
    height: number
    steps: number
    cfg: number
    seed: number
    guidance?: number
    clipType?: string
    auraShift?: number
    weightDtype?: string
  }
}

const ARCHES: ArchDef[] = [
  {
    id: "z-image",
    label: "Z-Image",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors",
      },
    ],
    sampler: "res_multistep",
    scheduler: "simple",
    capabilities: {
      negative: false,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 8,
      cfg: 1,
      seed: 0,
      clipType: "lumina2",
      auraShift: 3,
    },
  },
  {
    id: "krea2",
    label: "Krea 2",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "text_encoder",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    capabilities: {
      negative: false,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 8,
      cfg: 1,
      seed: 0,
      clipType: "krea2",
      weightDtype: "default",
    },
  },
  {
    id: "flux",
    label: "Flux.1",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "t5",
        path: "text_encoders",
        label: "T5 text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors",
      },
      {
        role: "clip_l",
        path: "text_encoders",
        label: "CLIP-L",
        required: true,
        defaultUrl:
          "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/Lumina_Image_2.0_Repackaged/resolve/main/split_files/vae/ae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    usesGuidance: true,
    capabilities: {
      negative: false,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 1,
      seed: 0,
      guidance: 3.5,
      weightDtype: "default",
    },
  },
  {
    id: "flux2",
    label: "Flux.2",
    slots: [
      {
        role: "unet",
        path: "diffusion_models",
        label: "Diffusion model",
        required: true,
      },
      {
        role: "clip",
        path: "text_encoders",
        label: "Text encoder",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/text_encoders/mistral_3_small_flux2_bf16.safetensors",
      },
      {
        role: "vae",
        path: "vae",
        label: "VAE",
        required: true,
        defaultUrl:
          "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors",
      },
    ],
    sampler: "euler",
    scheduler: "simple",
    usesGuidance: true,
    capabilities: {
      negative: false,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 1,
      seed: 0,
      guidance: 3.5,
      weightDtype: "default",
    },
  },
  {
    id: "sdxl",
    label: "SDXL",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
      },
      { role: "vae", path: "vae", label: "VAE (optional)", required: false },
    ],
    sampler: "euler",
    scheduler: "normal",
    capabilities: {
      negative: true,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 1024,
      height: 1024,
      steps: 28,
      cfg: 7,
      seed: 0,
    },
  },
  {
    id: "sd15",
    label: "SD 1.5",
    slots: [
      {
        role: "checkpoint",
        path: "checkpoints",
        label: "Checkpoint",
        required: true,
      },
      { role: "vae", path: "vae", label: "VAE (optional)", required: false },
    ],
    sampler: "euler",
    scheduler: "normal",
    capabilities: {
      negative: true,
      loras: false,
      controlnet: false,
      upscale: false,
    },
    defaults: {
      width: 512,
      height: 512,
      steps: 20,
      cfg: 7,
      seed: 0,
    },
  },
]

const ARCH_ITEMS = ARCHES.map((a) => ({ label: a.label, value: a.id }))

type ModelDraft = {
  role: string
  path: string
  filename: string
  url: string
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

/** Last path segment of a download URL (query/hash stripped). */
function filenameFromUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ""
  try {
    const parsed = new URL(trimmed)
    const segment = parsed.pathname.split("/").filter(Boolean).pop() ?? ""
    return decodeURIComponent(segment)
  } catch {
    const noQuery = trimmed.split(/[?#]/)[0] ?? ""
    const segment = noQuery.split("/").filter(Boolean).pop() ?? ""
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  }
}

/** Page URLs (CivitAI, …) need a backend resolve for the real filename. */
function needsProviderResolve(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (!u) return false
  if (u.includes("civitai.com")) {
    // Direct API download already has a version id — still resolve for filename.
    return true
  }
  const guessed = filenameFromUrl(url)
  return !guessed.includes(".")
}

function draftsForArch(arch: ArchDef): ModelDraft[] {
  return arch.slots.map((s) => {
    const url = s.defaultUrl ?? ""
    return {
      role: s.role,
      path: s.path,
      filename: filenameFromUrl(url),
      url,
    }
  })
}

type RecipeBlueprintFormProps = {
  onSaved: (id: string) => void
  /** When set, load this blueprint and save updates to the same id. */
  editBlueprintId?: string | null
  onEditCleared?: () => void
}

function isArchId(value: string): value is ArchId {
  return ARCHES.some((a) => a.id === value)
}

export function RecipeBlueprintForm({
  onSaved,
  editBlueprintId = null,
  onEditCleared,
}: RecipeBlueprintFormProps) {
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

  function resetForm() {
    setName("")
    setIdManual("")
    setIdTouched(false)
    setDescription("")
    applyArch("z-image")
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
            `${slot.label}: could not read a filename from the URL — use a direct file link or a CivitAI model page with a version selected`
          )
          return
        }
      } else if (url && !filename) {
        notifyError(
          `${slot.label}: could not read a filename from the URL — use a direct file link or a CivitAI model page`
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

    // Size/seed are product defaults (arch size, seed always random=0) — not authorable here.
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
    if (arch.defaults.weightDtype) {
      defaults.weightDtype = arch.defaults.weightDtype
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
      notifySuccess(
        editing ? "Blueprint updated" : "Blueprint saved",
        trimmedId
      )
      onSaved(trimmedId)
      if (!editing) resetForm()
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Save failed")
    } finally {
      setBusy(false)
    }
  }

  const fieldLabel = "text-[11px] font-medium text-muted-foreground"
  const sectionTitle =
    "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className={cn("py-4", STUDIO_PANEL_GUTTER)}>
          <StudioPanelColumn className="gap-4">
            <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
              <h2 className={sectionTitle}>Recipe</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={fieldLabel}>Name</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My realism pack"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={fieldLabel}>Id</span>
                  <Input
                    value={id}
                    onChange={(e) => {
                      setIdTouched(true)
                      setIdManual(e.target.value)
                    }}
                    placeholder="my-realism-pack"
                    className="font-mono text-xs"
                    disabled={editing || loadingEdit}
                    title={
                      editing
                        ? "Id is fixed while editing — save as a new recipe to change it"
                        : undefined
                    }
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className={fieldLabel}>Architecture</span>
                  <Select
                    items={ARCH_ITEMS}
                    value={ARCH_ITEMS.find((i) => i.value === archId) ?? null}
                    onValueChange={(item) => {
                      if (item) applyArch(item.value)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {ARCH_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className={fieldLabel}>Description</span>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional notes"
                    rows={1}
                    className="min-h-9 resize-none"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className={sectionTitle}>Models</h2>
                <p className="text-[11px] text-muted-foreground">
                  Filename from URL
                </p>
              </div>
              <div className="divide-y divide-border/50">
                {arch.slots.map((slot) => {
                  const index = models.findIndex((m) => m.role === slot.role)
                  const row = index >= 0 ? models[index] : null
                  if (!row || index < 0) return null
                  return (
                    <div
                      key={slot.role}
                      className="grid gap-1.5 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-medium">
                          {slot.label}
                          {slot.required ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                        </p>
                        <span
                          className="font-mono text-[10px] text-muted-foreground/70"
                          title={`Comfy folder: ${slot.path}/`}
                        >
                          {slot.path}/
                        </span>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,11rem)]">
                        <Input
                          value={row.url}
                          onChange={(e) =>
                            updateModelUrl(index, e.target.value)
                          }
                          onBlur={() => void resolveModelRow(index, row.url)}
                          placeholder="https://…/model.safetensors or CivitAI page"
                          className="font-mono text-xs"
                          required={slot.required}
                          aria-label={`${slot.label} download URL`}
                        />
                        <Input
                          value={row.filename}
                          readOnly
                          tabIndex={-1}
                          placeholder="filename.safetensors"
                          className="border-transparent bg-transparent font-mono text-xs text-muted-foreground shadow-none read-only:opacity-100"
                          aria-label={`${slot.label} filename`}
                          title={row.filename || "Filled from URL"}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
              <h2 className={sectionTitle}>Generate defaults</h2>
              <div
                className={
                  archId === "flux2"
                    ? "grid gap-2.5"
                    : "grid gap-2.5 sm:grid-cols-2"
                }
              >
                <div className="flex flex-col gap-1">
                  <span className={fieldLabel}>Sampler</span>
                  <Select
                    items={COMFY_SAMPLER_ITEMS}
                    value={
                      COMFY_SAMPLER_ITEMS.find((i) => i.value === sampler) ??
                      null
                    }
                    onValueChange={(item) => {
                      if (item) setSampler(item.value)
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup alignItemWithTrigger={false}>
                      {COMFY_SAMPLER_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
                {archId === "flux2" ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Scheduler: Flux2Scheduler (built-in)
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className={fieldLabel}>Scheduler</span>
                    <Select
                      items={COMFY_SCHEDULER_ITEMS}
                      value={
                        COMFY_SCHEDULER_ITEMS.find(
                          (i) => i.value === scheduler
                        ) ?? null
                      }
                      onValueChange={(item) => {
                        if (item) setScheduler(item.value)
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup alignItemWithTrigger={false}>
                        {COMFY_SCHEDULER_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={fieldLabel}>Steps</span>
                  <NumberField
                    size="sm"
                    value={steps}
                    onValueChange={(v) => setSteps(v ?? 0)}
                  >
                    <NumberFieldGroup>
                      <NumberFieldInput />
                    </NumberFieldGroup>
                  </NumberField>
                </label>
                {arch.usesGuidance ? (
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={fieldLabel}>Guidance</span>
                    <NumberField
                      size="sm"
                      value={guidance}
                      onValueChange={(v) => setGuidance(v ?? 0)}
                    >
                      <NumberFieldGroup>
                        <NumberFieldInput />
                      </NumberFieldGroup>
                    </NumberField>
                  </label>
                ) : (
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={fieldLabel}>CFG</span>
                    <NumberField
                      size="sm"
                      value={cfg}
                      onValueChange={(v) => setCfg(v ?? 0)}
                    >
                      <NumberFieldGroup>
                        <NumberFieldInput />
                      </NumberFieldGroup>
                    </NumberField>
                  </label>
                )}
              </div>
              {arch.capabilities.negative ? (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={allowNegative}
                    onChange={(e) => setAllowNegative(e.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  <span className="text-muted-foreground">
                    Negative prompt when CFG &gt; 1
                  </span>
                </label>
              ) : null}
            </section>
          </StudioPanelColumn>
        </div>
      </ScrollArea>

      <StudioPanelFooter>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {loadingEdit
            ? "Loading blueprint…"
            : editing
              ? `Editing · ${footerStatus}`
              : footerStatus}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || loadingEdit}
              onClick={() => {
                resetForm()
                onEditCleared?.()
              }}
            >
              New recipe
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={busy || loadingEdit}
            onClick={() => void handleSave()}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Save recipe"}
          </Button>
        </div>
      </StudioPanelFooter>
    </div>
  )
}
