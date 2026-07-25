"use client"

import { DownloadIcon, FolderOpenIcon, Trash2Icon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  deleteUserLora,
  listLoras,
  listModelFiles,
  listUpscalers,
  onLoraProgress,
  onLorasUpdated,
  onUpscaleProgress,
  onUpscalersUpdated,
  openModelsDir,
  resolveModelUrl,
  saveUserLora,
  type LoraPack,
  type ModelFileEntry,
  type UpscaleModelInfo,
} from "@/lib/host"
import { formatBytes } from "@/lib/format"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

const ARCH_OPTIONS = [
  "krea2",
  "z-image",
  "flux",
  "flux2",
  "ideogram4",
  "sdxl",
  "sd15",
] as const

type ModelsLibraryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, Install buttons target this arch first. */
  preferArch?: string | null
  /** Global download queue — LoRA install. */
  onInstallLora?: (id: string, arch: string) => void
  /** Global download queue — upscale model install. */
  onInstallUpscaler?: (id: string) => void
}

function ModelsLibraryBody({
  preferArch,
  onInstallLora,
  onInstallUpscaler,
}: {
  preferArch?: string | null
  onInstallLora?: (id: string, arch: string) => void
  onInstallUpscaler?: (id: string) => void
}) {
  const [tab, setTab] = useState<"loras" | "upscale" | "files">("loras")
  const [files, setFiles] = useState<ModelFileEntry[] | null>(null)
  const [packs, setPacks] = useState<LoraPack[] | null>(null)
  const [upscalers, setUpscalers] = useState<UpscaleModelInfo[] | null>(null)
  const [busyKeys, setBusyKeys] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState("")
  const [newId, setNewId] = useState("")
  const [newArch, setNewArch] = useState<string>("krea2")
  const [newUrl, setNewUrl] = useState("")
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(() => {
    void listLoras()
      .then(setPacks)
      .catch((e) => {
        notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
        setPacks([])
      })
    void listUpscalers()
      .then(setUpscalers)
      .catch((e) => {
        notifyError(e instanceof Error ? e.message : String(e), "Upscale")
        setUpscalers([])
      })
    void listModelFiles()
      .then(setFiles)
      .catch((e) => {
        notifyError(e instanceof Error ? e.message : String(e), "Models")
        setFiles([])
      })
  }, [])

  useEffect(() => {
    refresh()
    let unlistenUpdated: (() => void) | undefined
    let unlistenProgress: (() => void) | undefined
    let unlistenUpscaleUpdated: (() => void) | undefined
    let unlistenUpscaleProgress: (() => void) | undefined
    void onLorasUpdated(() => refresh()).then((u) => {
      unlistenUpdated = u
    })
    void onLoraProgress((p) => {
      const key = `${p.loraId}:${p.arch}`
      if (
        p.stage === "done" ||
        p.stage === "error" ||
        p.stage === "cancelled"
      ) {
        setBusyKeys((prev) => prev.filter((k) => k !== key))
        refresh()
      } else if (p.stage === "queued" || p.stage === "download") {
        setBusyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
      }
    }).then((u) => {
      unlistenProgress = u
    })
    void onUpscalersUpdated(() => refresh()).then((u) => {
      unlistenUpscaleUpdated = u
    })
    void onUpscaleProgress((p) => {
      const key = `upscale:${p.modelId}`
      if (
        p.stage === "done" ||
        p.stage === "error" ||
        p.stage === "cancelled"
      ) {
        setBusyKeys((prev) => prev.filter((k) => k !== key))
        refresh()
      } else if (p.stage === "queued" || p.stage === "download") {
        setBusyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
      }
    }).then((u) => {
      unlistenUpscaleProgress = u
    })
    return () => {
      unlistenUpdated?.()
      unlistenProgress?.()
      unlistenUpscaleUpdated?.()
      unlistenUpscaleProgress?.()
    }
  }, [refresh])

  const list = files ?? []
  const totalBytes = list.reduce((sum, f) => sum + f.bytes, 0)
  const loraList = packs ?? []
  const upscaleList = upscalers ?? []

  function handleInstall(pack: LoraPack, arch: string) {
    const variant = pack.variants.find((v) => v.arch === arch)
    if (!variant) return
    const key = `${pack.id}:${arch}`
    setBusyKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
    onInstallLora?.(pack.id, arch)
  }

  async function handleSaveUser() {
    const name = newName.trim()
    const id =
      newId.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    if (!name || !id || !newUrl.trim()) {
      notifyError("Name and URL are required", "Add LoRA")
      return
    }
    setSaving(true)
    try {
      const resolved = await resolveModelUrl(newUrl.trim())
      const filename =
        resolved.filename?.trim() || `${id}-${newArch}.safetensors`
      await saveUserLora({
        id,
        name,
        variants: [
          {
            arch: newArch,
            filename,
            path: "loras",
            url: resolved.downloadUrl || newUrl.trim(),
          },
        ],
      })
      notifySuccess("LoRA pack saved", name)
      setAdding(false)
      setNewName("")
      setNewId("")
      setNewUrl("")
      refresh()
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Add LoRA")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Models library</DialogTitle>
        <DialogDescription>
          Shared weights, LoRAs, and upscalers
          {files && files.length > 0
            ? ` · ${files.length} files · ${formatBytes(totalBytes)}`
            : null}
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="max-h-[55vh] overflow-y-auto">
        <div className="mb-3 flex gap-1 rounded-lg border border-border/60 p-0.5">
          <button
            type="button"
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === "loras"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("loras")}
          >
            LoRAs
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === "upscale"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("upscale")}
          >
            Upscale
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === "files"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("files")}
          >
            Files
          </button>
        </div>

        {tab === "loras" ? (
          <div className="space-y-3">
            {packs == null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : loraList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No LoRA packs yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {loraList.map((pack) => (
                  <li
                    key={pack.id}
                    className="rounded-xl border border-border/50 bg-card/40 px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {pack.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {pack.source === "official" ? "Official" : "Mine"}
                          {" · "}
                          {pack.variantsReady}/{pack.variantCount} files
                          {" · "}
                          {pack.arches.join(", ")}
                        </p>
                      </div>
                      {pack.source === "user" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="shrink-0 rounded-full px-2"
                          onClick={() => {
                            void deleteUserLora(pack.id)
                              .then(() => {
                                notifySuccess("LoRA removed")
                                refresh()
                              })
                              .catch((e) =>
                                notifyError(
                                  e instanceof Error ? e.message : String(e)
                                )
                              )
                          }}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {pack.variants.map((v) => {
                        const key = `${pack.id}:${v.arch}`
                        const prefer =
                          preferArch != null && v.arch === preferArch
                        const busy = busyKeys.includes(key)
                        return (
                          <Button
                            key={v.arch}
                            type="button"
                            size="sm"
                            variant={v.ready ? "secondary" : "outline"}
                            className={cn(
                              "rounded-full before:hidden",
                              prefer && !v.ready && "border-primary/50"
                            )}
                            disabled={v.ready || busy}
                            onClick={() => void handleInstall(pack, v.arch)}
                          >
                            {!v.ready ? (
                              <DownloadIcon className="size-3.5" />
                            ) : null}
                            {v.arch}
                            {v.ready ? " ✓" : busy ? "…" : ""}
                          </Button>
                        )
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {adding ? (
              <div className="space-y-2 rounded-xl border border-border/60 p-3">
                <p className="text-xs font-medium">Add My LoRA</p>
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  placeholder="Id (optional)"
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={newArch}
                  onChange={(e) => setNewArch(e.target.value)}
                >
                  {ARCH_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="CivitAI / download URL"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdding(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleSaveUser()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full before:hidden"
                onClick={() => setAdding(true)}
              >
                Add My LoRA
              </Button>
            )}
          </div>
        ) : tab === "upscale" ? (
          <div className="space-y-3">
            {upscalers == null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upscaleList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Official upscalers listed.
              </p>
            ) : (
              <ul className="space-y-2">
                {upscaleList.map((model) => {
                  const key = `upscale:${model.id}`
                  const busy = busyKeys.includes(key)
                  return (
                    <li
                      key={model.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {model.name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Official · {model.kind === "supir" ? "SUPIR" : "SR"} ·{" "}
                          {model.scale}× · {model.filename}
                        </p>
                        {model.description ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {model.description}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={model.ready ? "secondary" : "outline"}
                        className="shrink-0 rounded-full before:hidden"
                        disabled={model.ready || busy}
                        onClick={() => {
                          setBusyKeys((prev) =>
                            prev.includes(key) ? prev : [...prev, key]
                          )
                          onInstallUpscaler?.(model.id)
                        }}
                      >
                        {!model.ready ? (
                          <DownloadIcon className="size-3.5" />
                        ) : null}
                        {model.ready ? "Ready" : busy ? "…" : "Install"}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              Used from Advanced → Refine on any image blueprint. Ultimate SD
              Upscale is a separate custom node installed from Refine.
            </p>
          </div>
        ) : files == null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No model files yet. Install a blueprint or LoRA to download weights
            here.
          </p>
        ) : (
          <ul className="space-y-1.5 font-mono text-[11px]">
            {list.map((f) => (
              <li
                key={f.relativePath}
                className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 last:border-0"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {f.relativePath}
                </span>
                <span className="shrink-0 text-foreground/80 tabular-nums">
                  {formatBytes(f.bytes)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Close
        </DialogClose>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void openModelsDir().catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not open folder"
              )
            )
          }}
        >
          <FolderOpenIcon />
          Open folder
        </Button>
      </DialogFooter>
    </>
  )
}

export function ModelsLibraryDialog({
  open,
  onOpenChange,
  preferArch,
  onInstallLora,
  onInstallUpscaler,
}: ModelsLibraryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-lg">
        {open ? (
          <ModelsLibraryBody
            preferArch={preferArch}
            onInstallLora={onInstallLora}
            onInstallUpscaler={onInstallUpscaler}
          />
        ) : null}
      </DialogPopup>
    </Dialog>
  )
}
