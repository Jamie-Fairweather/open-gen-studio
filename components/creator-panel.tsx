"use client"

import {
  ExternalLinkIcon,
  FolderOpenIcon,
  PlayIcon,
  SaveIcon,
} from "lucide-react"
import { useState } from "react"
import { SaveBlueprintDialog } from "@/components/save-blueprint-dialog"
import { Button } from "@/components/ui/button"
import { creatorOpenComfy, openUserBlueprintsDir } from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

type CreatorPanelProps = {
  comfyHealthy: boolean
  onBlueprintsChanged: () => void
}

export function CreatorPanel({
  comfyHealthy,
  onBlueprintsChanged,
}: CreatorPanelProps) {
  const [opening, setOpening] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [comfyUrl, setComfyUrl] = useState<string | null>(null)

  async function handleOpenComfy() {
    setOpening(true)
    try {
      const url = await creatorOpenComfy()
      setComfyUrl(url)
      notifySuccess("ComfyUI opened", "Build your graph, then Save blueprint.")
    } catch (e) {
      notifyError(
        e instanceof Error ? e.message : String(e),
        "Could not open Comfy"
      )
    } finally {
      setOpening(false)
    }
  }

  async function handleReveal() {
    try {
      const path = await openUserBlueprintsDir()
      notifySuccess("User blueprints folder", path)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-5 py-8 md:px-10">
      <div className="w-full max-w-xl text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight uppercase md:text-5xl">
          Creator
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Author workflows in the real ComfyUI, then save them as{" "}
          <span className="text-foreground">My blueprints</span> under your app
          data folder. Official stays a manual copy when you want to ship one.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="lg"
            className="rounded-full px-5"
            disabled={opening}
            onClick={() => void handleOpenComfy()}
          >
            {opening ? (
              "Starting…"
            ) : (
              <>
                <PlayIcon />
                {comfyHealthy ? "Open ComfyUI" : "Start & open ComfyUI"}
              </>
            )}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="rounded-full px-5"
            onClick={() => setSaveOpen(true)}
          >
            <SaveIcon />
            Save blueprint
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="rounded-full px-5 before:hidden"
            onClick={() => void handleReveal()}
          >
            <FolderOpenIcon />
            Reveal folder
          </Button>
        </div>

        {comfyUrl ? (
          <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ExternalLinkIcon className="size-3.5" />
            <span className="font-mono">{comfyUrl}</span>
          </p>
        ) : null}

        <ol className="mt-10 space-y-2 text-left text-sm text-muted-foreground">
          <li>1. Open ComfyUI and build or load a workflow.</li>
          <li>
            2. Save blueprint — capture the graph (or import an API export).
          </li>
          <li>3. Map User Mode controls, then generate from Image studio.</li>
        </ol>
      </div>

      <SaveBlueprintDialog
        key={saveOpen ? "save-open" : "save-closed"}
        open={saveOpen}
        onOpenChange={setSaveOpen}
        onSaved={() => onBlueprintsChanged()}
      />
    </div>
  )
}
