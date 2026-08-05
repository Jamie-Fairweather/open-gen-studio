"use client"

import { HardDriveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SettingsModelsCard({
  onBrowseModels,
}: {
  onBrowseModels: () => void
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="font-medium">Models</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Shared weights library used by every blueprint.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3"
        onClick={onBrowseModels}
      >
        <HardDriveIcon />
        Browse models
      </Button>
    </div>
  )
}
