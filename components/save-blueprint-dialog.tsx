"use client"

import { KeyRoundIcon } from "lucide-react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  creatorCaptureWorkflow,
  creatorSuggestPackaging,
  saveUserBlueprint,
  type BindableInput,
  type EmbeddedModel,
  type SuggestedControl,
  type SuggestedModel,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

/** Built-in User Mode slots (+ Other for custom advanced controls). */
type UiSlotKind = "prompt" | "negative" | "width" | "height" | "other"

type ControlRow = {
  key: string
  uiSlot: UiSlotKind
  /** Display / custom name — required when uiSlot is `other`. */
  slotName: string
  id: string
  type: string
  nodeId: string
  input: string
  group: string
  default?: unknown
  include: boolean
  fixed: boolean
}

const UI_SLOT_OPTIONS: {
  value: UiSlotKind
  label: string
  id: string
  type: string
  group: string
  fixed: boolean
}[] = [
  {
    value: "prompt",
    label: "Prompt",
    id: "prompt",
    type: "textarea",
    group: "default",
    fixed: true,
  },
  {
    value: "negative",
    label: "Negative prompt",
    id: "negative",
    type: "textarea",
    group: "default",
    fixed: true,
  },
  {
    value: "width",
    label: "Width",
    id: "width",
    type: "number",
    group: "advanced",
    fixed: true,
  },
  {
    value: "height",
    label: "Height",
    id: "height",
    type: "number",
    group: "advanced",
    fixed: true,
  },
  {
    value: "other",
    label: "Other",
    id: "",
    type: "number",
    group: "advanced",
    fixed: false,
  },
]

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

function bindingKey(nodeId: string, input: string): string {
  return `${nodeId}.${input}`
}

function bindingLabel(b: BindableInput): string {
  const head = b.title?.trim() || b.classType
  return `${head} · ${b.nodeId}.${b.input}`
}

function isBound(c: ControlRow): boolean {
  return Boolean(c.nodeId && c.input)
}

function kindsForRow(row: ControlRow): string[] {
  if (row.type === "number" || row.type === "slider") return ["number"]
  if (row.type === "textarea") return ["string"]
  return ["string", "number", "boolean"]
}

function uiSlotFromSuggested(c: SuggestedControl): UiSlotKind {
  if (
    c.id === "prompt" ||
    c.id === "negative" ||
    c.id === "width" ||
    c.id === "height"
  ) {
    return c.id
  }
  return "other"
}

function rowFromSuggested(c: SuggestedControl, key: string): ControlRow {
  const uiSlot = uiSlotFromSuggested(c)
  return {
    key,
    uiSlot,
    slotName: uiSlot === "other" ? c.label || c.id : "",
    id: c.id,
    type: c.type,
    nodeId: c.nodeId,
    input: c.input,
    group: c.group,
    default: c.default,
    include: c.include,
    fixed: c.fixed,
  }
}

function applyUiSlot(row: ControlRow, slot: UiSlotKind): ControlRow {
  const opt = UI_SLOT_OPTIONS.find((o) => o.value === slot)!
  if (slot === "other") {
    const name = row.slotName.trim() || row.id || "custom"
    const id = slugify(name) || "custom"
    return {
      ...row,
      uiSlot: "other",
      slotName: name,
      id,
      type: row.type === "textarea" ? "number" : row.type || "number",
      group: row.group || "advanced",
      fixed: false,
      include: row.include,
    }
  }
  return {
    ...row,
    uiSlot: slot,
    slotName: "",
    id: opt.id,
    type: opt.type,
    group: opt.group,
    fixed: opt.fixed,
    include: true,
  }
}

type SaveBlueprintDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (id: string) => void
}

export function SaveBlueprintDialog({
  open,
  onOpenChange,
  onSaved,
}: SaveBlueprintDialogProps) {
  const rowIdPrefix = useId()
  const [busy, setBusy] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [name, setName] = useState("")
  const [idManual, setIdManual] = useState("")
  const [idTouched, setIdTouched] = useState(false)
  const [category, setCategory] = useState("image")
  const [description, setDescription] = useState("")
  const [workflow, setWorkflow] = useState<Record<string, unknown> | null>(null)
  const [controls, setControls] = useState<ControlRow[]>([])
  const [models, setModels] = useState<SuggestedModel[]>([])
  const [bindableInputs, setBindableInputs] = useState<BindableInput[]>([])

  const id = idTouched ? idManual : slugify(name)

  async function applyWorkflow(
    wf: Record<string, unknown>,
    embeddedModels?: EmbeddedModel[]
  ) {
    setWorkflow(wf)
    const suggestions = await creatorSuggestPackaging(wf, embeddedModels)
    setControls(
      suggestions.controls.map((c, i) =>
        rowFromSuggested(c, `${rowIdPrefix}-${i}`)
      )
    )
    setModels(suggestions.models)
    setBindableInputs(suggestions.bindableInputs)
    return suggestions.models
  }

  async function handleCapture() {
    setCapturing(true)
    try {
      const captured = await creatorCaptureWorkflow()
      const models = await applyWorkflow(
        captured.workflow,
        captured.embeddedModels
      )
      const withUrl = models.filter((m) => m.url).length
      notifySuccess(
        "Workflow captured",
        withUrl > 0
          ? `Filled ${withUrl} model download URL(s) from ComfyUI. Review and save.`
          : "Map controls to node inputs, then save."
      )
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Capture failed")
    } finally {
      setCapturing(false)
    }
  }

  async function handleImportFile(file: File | null) {
    if (!file) return
    try {
      const text = await file.text()
      const wf = JSON.parse(text) as Record<string, unknown>
      if (!wf || typeof wf !== "object" || Array.isArray(wf)) {
        throw new Error("File must be a Comfy API workflow object")
      }
      await applyWorkflow(wf)
      if (!name) setName(file.name.replace(/\.json$/i, ""))
      notifySuccess("Workflow imported")
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Import failed")
    }
  }

  function updateRow(index: number, patch: Partial<ControlRow>) {
    const next = [...controls]
    next[index] = { ...next[index], ...patch }
    setControls(next)
  }

  function updateUiSlot(index: number, slot: UiSlotKind) {
    const row = controls[index]
    if (row.fixed && slot !== row.uiSlot) return

    // Block duplicate built-in slots.
    if (slot !== "other") {
      const taken = controls.some(
        (c, i) => i !== index && c.uiSlot === slot && (c.include || c.fixed)
      )
      if (taken) {
        notifyError(`UI slot "${slot}" is already used on another row`)
        return
      }
    }

    const next = [...controls]
    next[index] = applyUiSlot(row, slot)
    setControls(next)
  }

  function updateSlotName(index: number, slotName: string) {
    const row = controls[index]
    if (row.uiSlot !== "other") return
    const id = slugify(slotName)
    if (
      id === "prompt" ||
      id === "negative" ||
      id === "width" ||
      id === "height"
    ) {
      notifyError(`"${id}" is a built-in slot — pick it from UI slot instead`)
      return
    }
    updateRow(index, { slotName, id: id || row.id })
  }

  function updateBinding(index: number, key: string) {
    const c = controls[index]
    if (!key) {
      updateRow(index, {
        nodeId: "",
        input: "",
        default: undefined,
        include: c.fixed ? true : false,
      })
      return
    }
    const b = bindableInputs.find((x) => bindingKey(x.nodeId, x.input) === key)
    if (!b) return
    const type =
      c.uiSlot === "other"
        ? b.kind === "string"
          ? "textarea"
          : b.kind === "boolean"
            ? "text"
            : "number"
        : c.type
    updateRow(index, {
      nodeId: b.nodeId,
      input: b.input,
      default: b.current,
      include: true,
      type,
    })
  }

  async function handleSave() {
    if (!workflow) {
      notifyError("Capture or import a workflow first")
      return
    }
    const trimmedId = id.trim()
    if (!trimmedId || !name.trim()) {
      notifyError("Name and id are required")
      return
    }
    const unboundFixed = controls.filter((c) => c.fixed && !isBound(c))
    if (unboundFixed.length > 0) {
      notifyError(
        `Bind required controls: ${unboundFixed.map((c) => UI_SLOT_OPTIONS.find((o) => o.value === c.uiSlot)?.label ?? c.id).join(", ")}`
      )
      return
    }
    const unnamedOther = controls.filter(
      (c) =>
        (c.include || c.fixed) && c.uiSlot === "other" && !c.slotName.trim()
    )
    if (unnamedOther.length > 0) {
      notifyError("Give each Other row a slot name")
      return
    }

    const toSave = controls.filter((c) => (c.include || c.fixed) && isBound(c))
    if (toSave.length === 0) {
      notifyError("At least one bound control is required")
      return
    }

    const ids = toSave.map((c) => c.id)
    if (new Set(ids).size !== ids.length) {
      notifyError("Duplicate control ids — rename Other slot names")
      return
    }

    setBusy(true)
    try {
      await saveUserBlueprint({
        id: trimmedId,
        name: name.trim(),
        category: category.trim() || "image",
        description: description.trim(),
        runtime: "comfyui",
        controls: toSave.map((c) => ({
          id: c.id,
          type: c.type,
          nodeId: c.nodeId,
          input: c.input,
          label:
            c.uiSlot === "other"
              ? c.slotName.trim()
              : (UI_SLOT_OPTIONS.find((o) => o.value === c.uiSlot)?.label ??
                c.id),
          group: c.group,
          default: c.default,
        })),
        models,
        workflow,
      })
      notifySuccess("Blueprint saved", trimmedId)
      onSaved(trimmedId)
      onOpenChange(false)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-4xl sm:max-w-4xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>Save blueprint</DialogTitle>
          <DialogDescription>
            Packages the current Comfy graph into your user blueprints folder
            (not Official).
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex max-h-[min(70vh,640px)] flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={capturing || busy}
              onClick={() => void handleCapture()}
            >
              {capturing ? "Capturing…" : "Capture from Comfy"}
            </Button>
            <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-input bg-background px-3 text-sm hover:bg-accent/50">
              Import workflow.api.json
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                disabled={busy}
                onChange={(e) =>
                  void handleImportFile(e.target.files?.[0] ?? null)
                }
              />
            </label>
            {workflow ? (
              <span className="self-center text-xs text-muted-foreground">
                Workflow ready ({Object.keys(workflow).length} nodes)
              </span>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                Open Comfy first, then capture — or import an API export.
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My portrait pack"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Id</span>
              <Input
                value={id}
                onChange={(e) => {
                  setIdTouched(true)
                  setIdManual(e.target.value)
                }}
                placeholder="my-portrait-pack"
                className="font-mono"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs">
              <span className="text-muted-foreground">Category</span>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="image"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs sm:col-span-2">
              <span className="text-muted-foreground">Description</span>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          {controls.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Controls</h3>
              <p className="text-xs text-muted-foreground">
                Pick a UI slot, then bind a Comfy input. Use Other for Seed,
                Steps, CFG, etc.
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Use</th>
                      <th className="px-2 py-1.5 font-medium">UI slot</th>
                      <th className="px-2 py-1.5 font-medium">Slot name</th>
                      <th className="px-2 py-1.5 font-medium">Group</th>
                      <th className="px-2 py-1.5 font-medium">Comfy binding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controls.map((c, i) => {
                      const options = bindableInputs.filter((b) =>
                        kindsForRow(c).includes(b.kind)
                      )
                      const currentKey = isBound(c)
                        ? bindingKey(c.nodeId, c.input)
                        : ""
                      return (
                        <tr
                          key={c.key}
                          className={cn(
                            "border-t border-border/60",
                            c.fixed && "bg-muted/20"
                          )}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={c.fixed ? true : c.include}
                              disabled={c.fixed}
                              title={c.fixed ? "Required control" : undefined}
                              onChange={(e) => {
                                if (c.fixed) return
                                updateRow(i, { include: e.target.checked })
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="h-7 w-full min-w-[8.5rem] rounded-md border border-input bg-background px-1"
                              value={c.uiSlot}
                              disabled={c.fixed}
                              onChange={(e) =>
                                updateUiSlot(i, e.target.value as UiSlotKind)
                              }
                            >
                              {UI_SLOT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                  {o.fixed ? " (required)" : ""}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            {c.uiSlot === "other" ? (
                              <Input
                                className="h-7"
                                value={c.slotName}
                                placeholder="e.g. Seed"
                                onChange={(e) =>
                                  updateSlotName(i, e.target.value)
                                }
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            {c.fixed ? (
                              <span className="text-muted-foreground">
                                {c.group}
                              </span>
                            ) : (
                              <select
                                className="h-7 w-full rounded-md border border-input bg-background px-1"
                                value={c.group}
                                onChange={(e) =>
                                  updateRow(i, { group: e.target.value })
                                }
                              >
                                <option value="default">default</option>
                                <option value="advanced">advanced</option>
                              </select>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className={cn(
                                "h-7 w-full max-w-[300px] rounded-md border border-input bg-background px-1 font-mono text-[11px]",
                                c.fixed && !currentKey && "border-destructive"
                              )}
                              value={currentKey}
                              onChange={(e) => updateBinding(i, e.target.value)}
                            >
                              <option value="">
                                {c.fixed
                                  ? "Select required binding…"
                                  : "Not mapped"}
                              </option>
                              {options.map((b) => {
                                const key = bindingKey(b.nodeId, b.input)
                                return (
                                  <option key={key} value={key}>
                                    {bindingLabel(b)}
                                  </option>
                                )
                              })}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {models.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Models</h3>
              <p className="text-xs text-muted-foreground">
                URLs are optional — leave empty if files are already in your
                shared models library. A key means the URL is gated on Hugging
                Face (token required in Settings).
              </p>
              {models.some((m) => m.gated) ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <KeyRoundIcon className="size-3.5 shrink-0" />
                  This blueprint needs a Hugging Face token to download models.
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {models.map((m, i) => (
                  <div
                    key={`${m.path}/${m.filename}`}
                    className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[1fr_1fr_2fr]"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      {m.gated ? (
                        <span title="Gated Hugging Face model">
                          <KeyRoundIcon
                            className="size-3.5 shrink-0 text-amber-500"
                            aria-label="Gated model"
                          />
                        </span>
                      ) : null}
                      <span className="truncate">
                        {m.path}/{m.filename}
                      </span>
                    </span>
                    <Input
                      className="h-7 font-mono text-xs"
                      value={m.path}
                      onChange={(e) => {
                        const next = [...models]
                        next[i] = { ...m, path: e.target.value }
                        setModels(next)
                      }}
                      placeholder="path"
                    />
                    <Input
                      className="h-7 text-xs"
                      value={m.url}
                      onChange={(e) => {
                        const next = [...models]
                        next[i] = { ...m, url: e.target.value, gated: false }
                        setModels(next)
                      }}
                      placeholder="Download URL (optional)"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={busy || !workflow}
            className={cn(!workflow && "opacity-50")}
            onClick={() => void handleSave()}
          >
            {busy ? "Saving…" : "Save to My blueprints"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  )
}
