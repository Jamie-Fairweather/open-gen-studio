"use client"

import { FolderOpenIcon } from "lucide-react"
import { RecipeBlueprintForm } from "@/components/recipe-blueprint-form"
import { StudioPanel, StudioPanelHeader } from "@/components/studio-panel"
import { Button } from "@/components/ui/button"
import { openUserBlueprintsDir } from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

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
  async function handleReveal() {
    try {
      const path = await openUserBlueprintsDir()
      notifySuccess("User blueprints folder", path)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <StudioPanel>
      <StudioPanelHeader
        title="Creator"
        description={
          editBlueprintId
            ? `Editing ${editBlueprintId}`
            : "Recipe blueprint for My blueprints"
        }
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 before:hidden"
            onClick={() => void handleReveal()}
          >
            <FolderOpenIcon />
            Reveal folder
          </Button>
        }
      />

      <div className="min-h-0 flex-1">
        <RecipeBlueprintForm
          key={editBlueprintId ?? "new"}
          editBlueprintId={editBlueprintId}
          onEditCleared={onEditCleared}
          onSaved={() => onBlueprintsChanged()}
        />
      </div>
    </StudioPanel>
  )
}
