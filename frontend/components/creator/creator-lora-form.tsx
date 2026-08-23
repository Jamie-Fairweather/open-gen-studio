"use client"

import { CreatorLoraIdentitySection } from "./creator-lora-identity-section"
import { CreatorLoraVariantsSection } from "./creator-lora-variants-section"
import { useCreatorLoraForm } from "./use-creator-lora-form"
import {
  STUDIO_PANEL_GUTTER,
  StudioPanelColumn,
  StudioPanelFooter,
} from "@/components/shell"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LoraPack } from "@/lib/host"
import { cn } from "@/lib/utils"

type CreatorLoraFormProps = {
  editLoraId?: string | null
  onSaved: (pack: LoraPack) => void
  onDelete?: () => void
  onEditCleared?: () => void
}

/** Creator LoRA pack editor: identity + per-arch variants. */
export function CreatorLoraForm({
  editLoraId = null,
  onSaved,
  onDelete,
  onEditCleared,
}: CreatorLoraFormProps) {
  const form = useCreatorLoraForm({
    editLoraId,
    onSaved,
    onEditCleared,
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" scrollFade>
        <div className={cn("py-4", STUDIO_PANEL_GUTTER)}>
          <StudioPanelColumn className="gap-4">
            <CreatorLoraIdentitySection
              editing={form.editing}
              editLoraId={editLoraId}
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
            />
            <CreatorLoraVariantsSection
              variants={form.variants}
              setVariants={form.setVariants}
              usedArches={form.usedArches}
              busy={form.busy}
              loadingEdit={form.loadingEdit}
              expanding={form.expanding}
              updateVariant={form.updateVariant}
              tryExpandFromUrl={form.tryExpandFromUrl}
            />
          </StudioPanelColumn>
        </div>
      </ScrollArea>

      <StudioPanelFooter>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {form.loadingEdit
            ? "Loading LoRA…"
            : form.expanding
              ? "Reading CivitAI model…"
              : form.editing
                ? `Editing · My LoRAs/${editLoraId}`
                : `New · My LoRAs/${form.id || "…"}`}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {form.editing && onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={form.busy || form.loadingEdit || form.expanding}
              className="text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            disabled={form.busy || form.loadingEdit || form.expanding}
            onClick={() => void form.handleSave()}
          >
            {form.busy
              ? "Saving…"
              : form.editing
                ? "Save changes"
                : "Save LoRA"}
          </Button>
        </div>
      </StudioPanelFooter>
    </div>
  )
}
