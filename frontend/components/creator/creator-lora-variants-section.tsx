"use client"

import type { Dispatch, SetStateAction } from "react"
import {
  looksLikeCivitai,
  newRow,
  type VariantRow,
} from "./creator-lora-helpers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RECIPE_ARCHES, isRecipeArch } from "@/lib/arch"
import { PlusIcon, Trash2Icon } from "lucide-react"

/** Per-arch download URLs and the CivitAI expand action for a LoRA pack. */
export type CreatorLoraVariantsSectionProps = {
  variants: VariantRow[]
  setVariants: Dispatch<SetStateAction<VariantRow[]>>
  usedArches: Set<string>
  busy: boolean
  loadingEdit: boolean
  expanding: boolean
  updateVariant: (key: string, patch: Partial<VariantRow>) => void
  tryExpandFromUrl: (raw: string) => Promise<void>
}

/** Per-arch download URLs; first-row CivitAI paste expands the pack. */
export function CreatorLoraVariantsSection({
  variants,
  setVariants,
  usedArches,
  busy,
  loadingEdit,
  expanding,
  updateVariant,
  tryExpandFromUrl,
}: CreatorLoraVariantsSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
          Architectures
        </p>
        <p className="text-[11px] text-muted-foreground">
          Paste a CivitAI model link to auto-fill
        </p>
      </div>

      <div className="space-y-2">
        {variants.map((row, index) => (
          <div
            key={row.key}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <select
              className="flex h-9 w-full shrink-0 rounded-lg border border-input bg-background px-3 text-sm sm:w-36"
              value={row.arch}
              disabled={loadingEdit || expanding}
              onChange={(e) => updateVariant(row.key, { arch: e.target.value })}
            >
              {RECIPE_ARCHES.map((a) => (
                <option
                  key={a}
                  value={a}
                  disabled={usedArches.has(a) && a !== row.arch}
                >
                  {a}
                </option>
              ))}
              {!isRecipeArch(row.arch) ? (
                <option value={row.arch}>{row.arch}</option>
              ) : null}
            </select>
            <Input
              placeholder={
                index === 0 ? "CivitAI model / download URL" : "Download URL"
              }
              value={row.url}
              disabled={loadingEdit || expanding}
              onChange={(e) => updateVariant(row.key, { url: e.target.value })}
              onPaste={(e) => {
                if (index !== 0) return
                const pasted = e.clipboardData.getData("text")
                if (looksLikeCivitai(pasted)) {
                  window.setTimeout(() => {
                    void tryExpandFromUrl(pasted)
                  }, 0)
                }
              }}
              onBlur={() => {
                if (index === 0) void tryExpandFromUrl(row.url)
              }}
              className="min-w-0 flex-1 font-mono text-sm"
            />
            {variants.length > 1 ? (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={busy || loadingEdit || expanding}
                aria-label="Remove architecture"
                onClick={() =>
                  setVariants((rows) => rows.filter((r) => r.key !== row.key))
                }
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={
          busy ||
          loadingEdit ||
          expanding ||
          (RECIPE_ARCHES.length > 0 && variants.length >= RECIPE_ARCHES.length)
        }
        onClick={() => {
          const nextArch =
            RECIPE_ARCHES.find((a) => !usedArches.has(a)) ??
            RECIPE_ARCHES[0] ??
            "krea2"
          setVariants((rows) => [...rows, newRow({ arch: nextArch })])
        }}
      >
        <PlusIcon className="size-3.5" />
        Add architecture
      </Button>
    </section>
  )
}
