"use client"

import { useEffect, useState } from "react"
import {
  APP_LEGAL,
  APP_LEGAL_PRIVACY_URL,
  APP_LEGAL_TERMS_URL,
  APP_VERSION_FALLBACK,
} from "@/lib/legal"
import { isTauri, openExternalUrl } from "@/lib/host"
import { notifyError } from "@/lib/notify"

function LegalLink({ label, href }: { label: string; href: string }) {
  return (
    <button
      type="button"
      className="text-xs text-primary underline-offset-2 hover:underline"
      onClick={() => {
        void openExternalUrl(href).catch((e) =>
          notifyError(
            e instanceof Error ? e.message : String(e),
            "Could not open browser"
          )
        )
      }}
    >
      {label}
    </button>
  )
}

/** Owns About: live Tauri version (fallback if IPC fails) and legal/external links. */
export function SettingsAboutCard() {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (isTauri()) {
          const { getVersion } = await import("@tauri-apps/api/app")
          const next = await getVersion()
          if (!cancelled) setVersion(next)
          return
        }
      } catch {
        // fall through
      }
      if (!cancelled) setVersion(APP_VERSION_FALLBACK)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="rounded-xl border p-4">
      <p className="font-medium">About</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {APP_LEGAL.name}
        {version ? ` · v${version}` : ""}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        © {APP_LEGAL.operator}. Licensed under {APP_LEGAL.licenseName}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <LegalLink label="Privacy Policy" href={APP_LEGAL_PRIVACY_URL} />
        <LegalLink label="Terms of Use" href={APP_LEGAL_TERMS_URL} />
        <LegalLink label="License" href={APP_LEGAL.licenseUrl} />
        <LegalLink label="GitHub" href={APP_LEGAL.githubUrl} />
      </div>
    </div>
  )
}
