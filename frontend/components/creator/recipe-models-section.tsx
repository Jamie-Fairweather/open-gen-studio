"use client"

import { Input } from "@/components/ui/input"
import { WithTooltip } from "@/components/ui/tooltip"
import type { ModelDraft } from "./recipe-form-helpers"
import type { ArchDef } from "@/lib/creator-arches"

const sectionTitle =
  "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"

export type RecipeModelsSectionProps = {
  arch: ArchDef
  models: ModelDraft[]
  updateModelUrl: (index: number, url: string) => void
  resolveModelRow: (index: number, url: string) => Promise<void>
}

export function RecipeModelsSection({
  arch,
  models,
  updateModelUrl,
  resolveModelRow,
}: RecipeModelsSectionProps) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={sectionTitle}>Models</h2>
        <p className="text-[11px] text-muted-foreground">Filename from URL</p>
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
                <WithTooltip label={`Comfy folder: ${slot.path}/`}>
                  <span className="font-mono text-[10px] text-muted-foreground/70">
                    {slot.path}/
                  </span>
                </WithTooltip>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(7.5rem,11rem)]">
                <Input
                  value={row.url}
                  onChange={(e) => updateModelUrl(index, e.target.value)}
                  onBlur={() => void resolveModelRow(index, row.url)}
                  placeholder="https://…/model.safetensors or CivitAI page"
                  className="font-mono text-xs"
                  required={slot.required}
                  aria-label={`${slot.label} download URL`}
                />
                <WithTooltip label={row.filename || "Filled from URL"}>
                  <Input
                    value={row.filename}
                    readOnly
                    tabIndex={-1}
                    placeholder="filename.safetensors"
                    className="border-transparent bg-transparent font-mono text-xs text-muted-foreground shadow-none read-only:opacity-100"
                    aria-label={`${slot.label} filename`}
                  />
                </WithTooltip>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
