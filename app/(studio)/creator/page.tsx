"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CreatorPanel } from "@/components/creator-panel"
import { useStudioStore } from "@/components/studio/store"

function CreatorStudioBody() {
  const editBlueprintId = useStudioStore((s) => s.editBlueprintId)
  const setEditBlueprintId = useStudioStore((s) => s.setEditBlueprintId)
  const refreshBlueprints = useStudioStore((s) => s.refreshBlueprints)
  const router = useRouter()
  const searchParams = useSearchParams()
  const editFromQuery = searchParams.get("edit")

  useEffect(() => {
    if (!editFromQuery) return
    setEditBlueprintId(editFromQuery)
    router.replace("/creator")
  }, [editFromQuery, router, setEditBlueprintId])

  return (
    <div className="absolute inset-0 flex flex-col pt-14">
      <CreatorPanel
        editBlueprintId={editBlueprintId}
        onEditCleared={() => setEditBlueprintId(null)}
        onBlueprintsChanged={refreshBlueprints}
      />
    </div>
  )
}

export default function CreatorStudioPage() {
  return (
    <Suspense
      fallback={<div className="absolute inset-0 flex flex-col pt-14" />}
    >
      <CreatorStudioBody />
    </Suspense>
  )
}
