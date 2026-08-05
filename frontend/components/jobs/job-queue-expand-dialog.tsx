"use client"

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"
import { HistoryDetail, HistoryRow } from "@/components/jobs/history-ui"
import { SortableActiveRow } from "@/components/jobs/sortable-active-row"
import {
  runningStepLabel,
  useJobQueueActions,
} from "@/components/jobs/use-job-queue-actions"
import { useStudioStore } from "@/components/studio/store"
import {
  clearJobHistory,
  deleteJobHistoryItem,
  listJobHistory,
  onJobHistory,
  type JobHistoryItem,
} from "@/lib/host"
import { notifyError, notifySuccess } from "@/lib/notify"

export function JobQueueExpandDialog() {
  const open = useStudioStore((s) => s.queueExpandOpen)
  const setOpen = useStudioStore((s) => s.setQueueExpandOpen)
  const { jobQueue, waitingIds, clearQueue, reorderWaiting } =
    useJobQueueActions()
  const genStep = useStudioStore((s) => s.genStep)
  const [history, setHistory] = useState<JobHistoryItem[]>([])
  const [tab, setTab] = useState<"active" | "history">("active")
  const [tabSyncedOpen, setTabSyncedOpen] = useState(open)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string
    clearAll?: boolean
  } | null>(null)
  const historyRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Empty bar opens via the history icon — land on History. Otherwise Active.
  if (open !== tabSyncedOpen) {
    setTabSyncedOpen(open)
    if (open) {
      setTab(jobQueue.length === 0 ? "history" : "active")
    }
  }

  const refreshHistory = useEffectEvent(() => {
    void listJobHistory()
      .then((items) => {
        setHistory(items)
        setSelectedId((prev) => {
          if (prev && items.some((i) => i.jobId === prev)) return prev
          return items[0]?.jobId ?? null
        })
      })
      .catch(() => setHistory([]))
  })

  const scheduleHistoryRefresh = useEffectEvent(() => {
    if (historyRefreshTimer.current) clearTimeout(historyRefreshTimer.current)
    historyRefreshTimer.current = setTimeout(() => {
      historyRefreshTimer.current = null
      refreshHistory()
    }, 120)
  })

  useEffect(() => {
    if (!open) return
    refreshHistory()
    let unlisten: (() => void) | undefined
    void onJobHistory(() => scheduleHistoryRefresh()).then((u) => {
      unlisten = u
    })
    return () => {
      unlisten?.()
      if (historyRefreshTimer.current) {
        clearTimeout(historyRefreshTimer.current)
        historyRefreshTimer.current = null
      }
    }
  }, [open])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const runningStep = runningStepLabel(jobQueue, genStep)

  const selected = history.find((h) => h.jobId === selectedId) ?? null
  const purgeableCount = history.filter(
    (h) => h.status === "cancelled" || h.status === "failed"
  ).length

  const deleteHistory = async (id: string, shiftKey: boolean) => {
    const row = history.find((h) => h.jobId === id)
    const hasGallery = (row?.galleryItems.length ?? 0) > 0
    if (hasGallery && !shiftKey) {
      setConfirmDelete({ id })
      return
    }
    try {
      await deleteJobHistoryItem(id, hasGallery)
      setHistory((prev) => {
        const next = prev.filter((h) => h.jobId !== id)
        if (selectedId === id) setSelectedId(next[0]?.jobId ?? null)
        return next
      })
      notifySuccess("Removed from history")
    } catch (e) {
      notifyError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup
          className="h-[min(88dvh,820px)] w-[min(92vw,960px)] max-w-[960px] sm:max-w-[960px]"
          showCloseButton
        >
          <DialogHeader className="gap-3 px-5 pt-5 pb-0 sm:px-5">
            <DialogTitle className="sr-only">Job queue</DialogTitle>
            <DialogDescription className="sr-only">
              Active GPU lane and finished job history.
            </DialogDescription>
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "active" | "history")}
              className="gap-0"
            >
              <div className="flex items-center justify-between gap-3 pe-10">
                <TabsList variant="underline" className="gap-1">
                  <TabsTab
                    value="active"
                    className="h-8 items-center gap-1.5 px-2.5 text-sm"
                  >
                    <span>Active</span>
                    {jobQueue.length > 0 ? (
                      <span className="text-sm leading-none text-muted-foreground tabular-nums">
                        {jobQueue.length}
                      </span>
                    ) : null}
                  </TabsTab>
                  <TabsTab
                    value="history"
                    className="h-8 items-center gap-1.5 px-2.5 text-sm"
                  >
                    <span>History</span>
                    {history.length > 0 ? (
                      <span className="text-sm leading-none text-muted-foreground tabular-nums">
                        {history.length}
                      </span>
                    ) : null}
                  </TabsTab>
                </TabsList>
                {tab === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-muted-foreground"
                    disabled={jobQueue.length === 0}
                    onClick={clearQueue}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </Tabs>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-3 pb-5">
            {tab === "active" ? (
              <ScrollArea className="min-h-0 flex-1" scrollFade>
                {jobQueue.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    Queue empty.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={reorderWaiting}
                  >
                    <SortableContext
                      items={waitingIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="space-y-0.5 pe-2">
                        {jobQueue.map((item, index) => (
                          <SortableActiveRow
                            key={item.jobId}
                            item={item}
                            index={index}
                            total={jobQueue.length}
                            stepLabel={
                              item.status === "running" ? runningStep : null
                            }
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>
            ) : history.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No finished jobs yet.
              </p>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-4 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:grid-rows-[minmax(0,1fr)] md:gap-5">
                <div className="flex min-h-0 flex-col gap-2 md:row-span-1">
                  <ScrollArea className="h-full min-h-0 flex-1" scrollFade>
                    <ul className="space-y-0.5 pe-2">
                      {history.map((item) => (
                        <HistoryRow
                          key={item.jobId}
                          item={item}
                          selected={item.jobId === selectedId}
                          onSelect={() => setSelectedId(item.jobId)}
                          onDelete={(shift) =>
                            void deleteHistory(item.jobId, shift)
                          }
                        />
                      ))}
                    </ul>
                  </ScrollArea>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 justify-start px-2 text-muted-foreground"
                    disabled={purgeableCount === 0}
                    onClick={() => setConfirmDelete({ id: "", clearAll: true })}
                  >
                    Purge cancelled & failed
                    {purgeableCount > 0 ? (
                      <span className="text-muted-foreground/80 tabular-nums">
                        · {purgeableCount}
                      </span>
                    ) : null}
                  </Button>
                </div>
                <ScrollArea
                  className="h-full min-h-0 border-t border-border/50 pt-4 md:border-t-0 md:border-l md:ps-5 md:pt-0"
                  scrollFade
                >
                  {selected ? (
                    <HistoryDetail item={selected} />
                  ) : (
                    <p className="py-16 text-center text-sm text-muted-foreground">
                      Select a job.
                    </p>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null)
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.clearAll
                ? "Purge cancelled & failed?"
                : "Delete history item?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.clearAll
                ? "Removes cancelled and failed jobs from history. Completed jobs stay — delete those one at a time."
                : "This also deletes the linked gallery image. Tip: hold Shift while clicking delete to skip this warning."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                if (!target) return
                void (async () => {
                  try {
                    if (target.clearAll) {
                      await clearJobHistory(true)
                      setHistory((prev) => {
                        const next = prev.filter(
                          (h) =>
                            h.status !== "cancelled" && h.status !== "failed"
                        )
                        setSelectedId((sel) => {
                          if (sel && next.some((h) => h.jobId === sel)) {
                            return sel
                          }
                          return next[0]?.jobId ?? null
                        })
                        return next
                      })
                      notifySuccess("Purged cancelled & failed")
                    } else {
                      await deleteJobHistoryItem(target.id, true)
                      setHistory((prev) => {
                        const next = prev.filter((h) => h.jobId !== target.id)
                        if (selectedId === target.id) {
                          setSelectedId(next[0]?.jobId ?? null)
                        }
                        return next
                      })
                      notifySuccess("Removed from history")
                    }
                  } catch (e) {
                    notifyError(e instanceof Error ? e.message : String(e))
                  }
                })()
              }}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}
