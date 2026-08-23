"use client"

import {
  STUDIO_PANEL_GUTTER,
  StudioPanelColumn,
  StudioPanelFooter,
} from "@/components/shell"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { RecipeDefaultsSection } from "./recipe-defaults-section"
import { RecipeIdentitySection } from "./recipe-identity-section"
import { RecipeModelsSection } from "./recipe-models-section"
import { useRecipeBlueprintForm } from "./use-recipe-blueprint-form"

type RecipeBlueprintFormProps = {
  onSaved: (id: string) => void
  /** When set, load this blueprint and save updates to the same id. */
  editBlueprintId?: string | null
  onEditCleared?: () => void
  onDelete?: () => void
}

/** User blueprint editor: identity, model slots, and generate defaults. */
export function RecipeBlueprintForm({
  onSaved,
  editBlueprintId = null,
  onEditCleared,
  onDelete,
}: RecipeBlueprintFormProps) {
  const form = useRecipeBlueprintForm({
    onSaved,
    editBlueprintId,
    onEditCleared,
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className={cn("py-4", STUDIO_PANEL_GUTTER)}>
          <StudioPanelColumn className="gap-4">
            <RecipeIdentitySection
              editing={form.editing}
              editBlueprintId={editBlueprintId}
              busy={form.busy}
              loadingEdit={form.loadingEdit}
              thumbnailPath={form.thumbnailPath}
              pendingThumb={form.pendingThumb}
              setPendingThumb={form.setPendingThumb}
              setThumbnailPath={form.setThumbnailPath}
              name={form.name}
              setName={form.setName}
              id={form.id}
              setIdTouched={form.setIdTouched}
              setIdManual={form.setIdManual}
              archId={form.archId}
              applyArch={form.applyArch}
              description={form.description}
              setDescription={form.setDescription}
            />
            <RecipeModelsSection
              arch={form.arch}
              models={form.models}
              updateModelUrl={form.updateModelUrl}
              resolveModelRow={form.resolveModelRow}
            />
            <RecipeDefaultsSection
              archId={form.archId}
              arch={form.arch}
              sampler={form.sampler}
              setSampler={form.setSampler}
              scheduler={form.scheduler}
              setScheduler={form.setScheduler}
              steps={form.steps}
              setSteps={form.setSteps}
              cfg={form.cfg}
              setCfg={form.setCfg}
              guidance={form.guidance}
              setGuidance={form.setGuidance}
              allowNegative={form.allowNegative}
              setAllowNegative={form.setAllowNegative}
            />
          </StudioPanelColumn>
        </div>
      </ScrollArea>

      <StudioPanelFooter>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {form.loadingEdit
            ? "Loading blueprint…"
            : form.editing
              ? `Editing · ${form.footerStatus}`
              : form.footerStatus}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {form.editing && onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={form.busy || form.loadingEdit}
              className="text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={form.busy || form.loadingEdit}
            onClick={() => void form.handleSave()}
          >
            {form.busy
              ? "Saving…"
              : form.editing
                ? "Save changes"
                : "Save recipe"}
          </Button>
        </div>
      </StudioPanelFooter>
    </div>
  )
}
