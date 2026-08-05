"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { openExternalUrl } from "@/lib/host"
import { notifyError } from "@/lib/notify"

export type SettingsTokenCardProps = {
  title: string
  description: ReactNode
  savedLabel: string
  hasToken: boolean
  token: string
  onTokenChange: (value: string) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onClear: () => void
  fieldLabel: string
  placeholderUnset: string
  placeholderReplace: string
  saveLabel: string
  savingLabel: string
  externalLabel: string
  externalUrl: string
}

export function SettingsTokenCard({
  title,
  description,
  savedLabel,
  hasToken,
  token,
  onTokenChange,
  dirty,
  saving,
  onSave,
  onClear,
  fieldLabel,
  placeholderUnset,
  placeholderReplace,
  saveLabel,
  savingLabel,
  externalLabel,
  externalUrl,
}: SettingsTokenCardProps) {
  return (
    <div className="rounded-xl border p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <p className="mt-2 text-xs">
        {hasToken ? (
          <span className="text-foreground">{savedLabel}</span>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        )}
      </p>
      <label className="mt-3 flex flex-col gap-1.5 text-xs">
        <span className="text-muted-foreground">{fieldLabel}</span>
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasToken ? placeholderReplace : placeholderUnset}
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          className="font-mono text-xs"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving || !dirty || !token.trim()}
          onClick={onSave}
        >
          {saving ? savingLabel : saveLabel}
        </Button>
        {hasToken ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={onClear}
          >
            Clear
          </Button>
        ) : null}
        <button
          type="button"
          className="text-xs text-primary underline-offset-2 hover:underline"
          onClick={() => {
            void openExternalUrl(externalUrl).catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not open browser"
              )
            )
          }}
        >
          {externalLabel}
        </button>
      </div>
    </div>
  )
}
