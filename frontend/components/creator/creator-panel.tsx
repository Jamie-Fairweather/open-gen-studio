"use client"

import {
  ArrowLeftIcon,
  FolderOpenIcon,
  ImageIcon,
  LayersIcon,
  PlusIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { CreatorLoraForm } from "./creator-lora-form"
import { RecipeBlueprintForm } from "./recipe-blueprint-form"
import { useStudioStore } from "@/components/studio/store"
import {
  STUDIO_PANEL_GUTTER,
  StudioPanel,
  StudioPanelHeader,
} from "@/components/shell"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { ARCHES } from "@/lib/creator-arches"
import {
  deleteUserBlueprint,
  deleteUserLora,
  gallerySrc,
  listBlueprints,
  listLoras,
  openUserBlueprintsDir,
  openUserLorasDir,
  type Blueprint,
  type LoraPack,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"
import { cn } from "@/lib/utils"

type CreatorMode = "blueprint" | "lora"
type CreatorView = "list" | "editor"

const LIST_MAX = "max-w-5xl"

function archLabel(arch: string): string {
  return ARCHES.find((a) => a.id === arch)?.label ?? arch
}

type CreatorPanelProps = {
  onBlueprintsChanged: () => void
  editBlueprintId?: string | null
  onEditCleared?: () => void
}

export function CreatorPanel({
  onBlueprintsChanged,
  editBlueprintId = null,
  onEditCleared,
}: CreatorPanelProps) {
  const [mode, setMode] = useState<CreatorMode>("blueprint")
  const [view, setView] = useState<CreatorView>(() =>
    editBlueprintId ? "editor" : "list"
  )
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(
    editBlueprintId
  )
  const [selectedLoraId, setSelectedLoraId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [userBlueprints, setUserBlueprints] = useState<Blueprint[] | null>(null)
  const [userLoras, setUserLoras] = useState<LoraPack[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{
    kind: CreatorMode
    id: string
    name: string
  } | null>(null)

  const refreshBlueprints = useCallback(() => {
    void listBlueprints()
      .then((all) => {
        setUserBlueprints(
          all
            .filter((bp) => bp.source === "user")
            .toSorted((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch((e) => {
        notifyError(e instanceof Error ? e.message : String(e), "Blueprints")
        setUserBlueprints([])
      })
  }, [])

  const refreshLoras = useCallback(() => {
    void listLoras()
      .then((all) => {
        setUserLoras(
          all
            .filter((p) => p.source === "user")
            .toSorted((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch((e) => {
        notifyError(e instanceof Error ? e.message : String(e), "LoRAs")
        setUserLoras([])
      })
  }, [])

  useEffect(() => {
    refreshBlueprints()
    refreshLoras()
  }, [refreshBlueprints, refreshLoras])

  // Deep-link into a blueprint editor when the parent passes editBlueprintId.
  const [prevEditBlueprintId, setPrevEditBlueprintId] =
    useState(editBlueprintId)
  if (editBlueprintId !== prevEditBlueprintId) {
    setPrevEditBlueprintId(editBlueprintId)
    if (editBlueprintId) {
      setMode("blueprint")
      setSelectedBlueprintId(editBlueprintId)
      setCreating(false)
      setView("editor")
    }
  }

  function goToList() {
    setView("list")
    setCreating(false)
    setSelectedBlueprintId(null)
    setSelectedLoraId(null)
    onEditCleared?.()
    refreshBlueprints()
    refreshLoras()
  }

  function openCreate() {
    setCreating(true)
    if (mode === "blueprint") {
      setSelectedBlueprintId(null)
      onEditCleared?.()
    } else {
      setSelectedLoraId(null)
    }
    setView("editor")
  }

  function openEdit(id: string) {
    setCreating(false)
    if (mode === "blueprint") {
      setSelectedBlueprintId(id)
    } else {
      setSelectedLoraId(id)
    }
    setView("editor")
  }

  function handleModeChange(next: string | number | null) {
    if (next !== "blueprint" && next !== "lora") return
    setMode(next)
    setView("list")
    setCreating(false)
    setSelectedBlueprintId(null)
    setSelectedLoraId(null)
    onEditCleared?.()
  }

  async function handleReveal() {
    try {
      const path =
        mode === "blueprint"
          ? await openUserBlueprintsDir()
          : await openUserLorasDir()
      notifySuccess(
        mode === "blueprint" ? "User blueprints folder" : "User LoRAs folder",
        path
      )
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  async function confirmDelete() {
    const { kind, id, name } = pendingDelete!
    try {
      if (kind === "blueprint") {
        await deleteUserBlueprint(id)
        notifySuccess("Blueprint removed", name)
        goToList()
        refreshBlueprints()
        onBlueprintsChanged()
      } else {
        await deleteUserLora(id)
        notifySuccess("LoRA removed", name)
        useStudioStore
          .getState()
          .setLoraStack((prev) => prev.filter((entry) => entry.id !== id))
        goToList()
        refreshLoras()
      }
      setPendingDelete(null)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e), "Delete")
    }
  }

  const listLoading =
    mode === "blueprint" ? userBlueprints == null : userLoras == null
  const blueprints = userBlueprints ?? []
  const loras = userLoras ?? []
  const editingId = mode === "blueprint" ? selectedBlueprintId : selectedLoraId
  const inEditor = view === "editor"

  const listDescription = mode === "blueprint" ? "My blueprints" : "My LoRAs"
  const editorDescription = creating
    ? mode === "blueprint"
      ? "New blueprint"
      : "New LoRA"
    : editingId
      ? `Editing ${editingId}`
      : listDescription

  return (
    <StudioPanel>
      <StudioPanelHeader
        title="Creator"
        description={inEditor ? editorDescription : listDescription}
        action={
          <div className="flex shrink-0 items-center gap-2">
            {inEditor ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="before:hidden"
                onClick={goToList}
              >
                <ArrowLeftIcon />
                Back
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="before:hidden"
              onClick={() => void handleReveal()}
            >
              <FolderOpenIcon />
              Reveal folder
            </Button>
          </div>
        }
      />

      {inEditor ? (
        <div className="min-h-0 flex-1">
          {mode === "blueprint" ? (
            <RecipeBlueprintForm
              key={selectedBlueprintId ?? "new"}
              editBlueprintId={selectedBlueprintId}
              onEditCleared={goToList}
              onSaved={(id) => {
                setCreating(false)
                setSelectedBlueprintId(id)
                refreshBlueprints()
                onBlueprintsChanged()
              }}
              onDelete={
                selectedBlueprintId
                  ? () => {
                      const bp = userBlueprints?.find(
                        (b) => b.id === selectedBlueprintId
                      )
                      setPendingDelete({
                        kind: "blueprint",
                        id: selectedBlueprintId,
                        name: bp?.name ?? selectedBlueprintId,
                      })
                    }
                  : undefined
              }
            />
          ) : (
            <CreatorLoraForm
              key={selectedLoraId ?? "new"}
              editLoraId={selectedLoraId}
              onEditCleared={goToList}
              onSaved={(pack) => {
                setCreating(false)
                setSelectedLoraId(pack.id)
                refreshLoras()
              }}
              onDelete={
                selectedLoraId
                  ? () => {
                      const pack = userLoras?.find(
                        (p) => p.id === selectedLoraId
                      )
                      setPendingDelete({
                        kind: "lora",
                        id: selectedLoraId,
                        name: pack?.name ?? selectedLoraId,
                      })
                    }
                  : undefined
              }
            />
          )}
        </div>
      ) : (
        <>
          <div
            className={cn(
              "shrink-0 border-b border-border/60 py-2",
              STUDIO_PANEL_GUTTER
            )}
          >
            <div className={cn("mx-auto w-full", LIST_MAX)}>
              <Tabs
                value={mode}
                onValueChange={handleModeChange}
                className="gap-0"
              >
                <TabsList variant="underline" className="gap-1">
                  <TabsTab value="blueprint" className="h-8 px-2.5 text-sm">
                    Blueprint
                  </TabsTab>
                  <TabsTab value="lora" className="h-8 px-2.5 text-sm">
                    LoRA
                  </TabsTab>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="relative min-h-0 flex-1">
            <ScrollArea className="h-full" scrollFade>
              <div className={cn("py-4", STUDIO_PANEL_GUTTER)}>
                <div className={cn("mx-auto w-full", LIST_MAX)}>
                  {listLoading ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      Loading…
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <button
                        type="button"
                        onClick={openCreate}
                        className="flex flex-col overflow-hidden rounded-xl border border-dashed border-border/80 bg-card/40 text-left transition-colors hover:border-white/25 hover:bg-card/70"
                      >
                        <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted/40">
                          <PlusIcon className="size-10 text-muted-foreground" />
                        </div>
                        <div className="flex flex-1 flex-col gap-1 p-3">
                          <h4 className="leading-tight font-medium">
                            Create new
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {mode === "blueprint"
                              ? "Author a recipe for My blueprints"
                              : "Add a LoRA pack for your stack"}
                          </p>
                        </div>
                      </button>

                      {mode === "blueprint"
                        ? blueprints.map((bp) => (
                            <CreatorBlueprintCard
                              key={bp.id}
                              bp={bp}
                              onSelect={() => openEdit(bp.id)}
                            />
                          ))
                        : loras.map((pack) => (
                            <CreatorLoraCard
                              key={pack.id}
                              pack={pack}
                              onSelect={() => openEdit(pack.id)}
                            />
                          ))}
                    </div>
                  )}

                  {!listLoading &&
                  (mode === "blueprint"
                    ? blueprints.length === 0
                    : loras.length === 0) ? (
                    <p className="mt-4 text-center text-sm text-muted-foreground">
                      None yet — use Create new to start.
                    </p>
                  ) : null}
                </div>
              </div>
            </ScrollArea>
          </div>
        </>
      )}

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.kind === "lora" ? "LoRA" : "blueprint"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-medium text-foreground">
                {pendingDelete?.name}
              </span>{" "}
              from Creator. Installed weight files are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </StudioPanel>
  )
}

function CreatorBlueprintCard({
  bp,
  onSelect,
}: {
  bp: Blueprint
  onSelect: () => void
}) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-white/20">
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
          {bp.arch ? (
            <Badge
              variant="secondary"
              className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
            >
              {archLabel(bp.arch)}
            </Badge>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        className="flex flex-1 flex-col gap-1 p-3 text-left"
        onClick={onSelect}
      >
        <h4 className="truncate leading-tight font-medium">{bp.name}</h4>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {bp.id}
        </p>
        {bp.description ? (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {bp.description}
          </p>
        ) : null}
      </button>
    </article>
  )
}

function CreatorLoraCard({
  pack,
  onSelect,
}: {
  pack: LoraPack
  onSelect: () => void
}) {
  const archLabelText =
    pack.arches.length <= 3
      ? pack.arches.join(", ")
      : `${pack.arches.length} arches`

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-white/20">
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
          {archLabelText ? (
            <Badge
              variant="secondary"
              className="rounded-md bg-black/55 text-[10px] text-white backdrop-blur-sm"
            >
              {archLabelText}
            </Badge>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        className="flex flex-1 flex-col gap-1 p-3 text-left"
        onClick={onSelect}
      >
        <h4 className="truncate leading-tight font-medium">{pack.name}</h4>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {pack.id}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {pack.variantsReady}/{pack.variantCount} files
        </p>
      </button>
    </article>
  )
}
