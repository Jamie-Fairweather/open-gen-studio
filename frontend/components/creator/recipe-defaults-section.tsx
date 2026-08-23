"use client"

import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from "@/components/ui/number-field"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  COMFY_SAMPLER_ITEMS,
  COMFY_SCHEDULER_ITEMS,
} from "@/lib/comfy-samplers"
import type { ArchDef, ArchId } from "@/lib/creator-arches"

const fieldLabel = "text-[11px] font-medium text-muted-foreground"
const sectionTitle =
  "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"

/** Sampler, scheduler, steps, and CFG or guidance defaults for the chosen architecture. */
export type RecipeDefaultsSectionProps = {
  archId: ArchId
  arch: ArchDef
  sampler: string
  setSampler: (sampler: string) => void
  scheduler: string
  setScheduler: (scheduler: string) => void
  steps: number
  setSteps: (steps: number) => void
  cfg: number
  setCfg: (cfg: number) => void
  guidance: number
  setGuidance: (guidance: number) => void
  allowNegative: boolean
  setAllowNegative: (allow: boolean) => void
}

/** Sampler/scheduler plus steps and CFG or guidance for the chosen arch. */
export function RecipeDefaultsSection({
  archId,
  arch,
  sampler,
  setSampler,
  scheduler,
  setScheduler,
  steps,
  setSteps,
  cfg,
  setCfg,
  guidance,
  setGuidance,
  allowNegative,
  setAllowNegative,
}: RecipeDefaultsSectionProps) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border/50 bg-muted/10 p-4">
      <h2 className={sectionTitle}>Generate defaults</h2>
      <div
        className={
          archId === "flux2" || archId === "ideogram4"
            ? "grid gap-2.5"
            : "grid gap-2.5 sm:grid-cols-2"
        }
      >
        <div className="flex flex-col gap-1">
          <span className={fieldLabel}>Sampler</span>
          <Select
            items={COMFY_SAMPLER_ITEMS}
            value={COMFY_SAMPLER_ITEMS.find((i) => i.value === sampler) ?? null}
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
        ) : archId === "ideogram4" ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Scheduler: Ideogram4Scheduler (built-in)
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            <span className={fieldLabel}>Scheduler</span>
            <Select
              items={COMFY_SCHEDULER_ITEMS}
              value={
                COMFY_SCHEDULER_ITEMS.find((i) => i.value === scheduler) ?? null
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
  )
}
