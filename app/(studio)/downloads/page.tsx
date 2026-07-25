"use client"

import { DownloadsPanel } from "@/components/downloads-panel"
import { useStudio } from "@/components/studio/studio-provider"
import { notifyError } from "@/lib/notify"

export default function DownloadsStudioPage() {
  const s = useStudio()

  return (
    <div className="absolute inset-0 flex flex-col pt-14">
      <DownloadsPanel
        activeModel={s.activeModel}
        queuedModels={s.queuedModels}
        progress={s.installProgress}
        history={s.downloadHistory}
        onCancel={() => {
          void s
            .cancelBlueprintInstall()
            .catch((e) =>
              notifyError(
                e instanceof Error ? e.message : String(e),
                "Could not cancel"
              )
            )
        }}
        onRemoveBlueprint={s.removeQueuedInstall}
        onOpenBlueprints={() => s.setPickerOpen(true)}
      />
    </div>
  )
}
