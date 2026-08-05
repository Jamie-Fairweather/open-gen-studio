import {
  listJobQueue,
  onJobProgress,
  onJobQueue,
  onJobsUpdated,
} from "@/lib/host"
import {
  notifyError,
  notifyInfo,
  notifyProgress,
  notifyDismiss,
} from "@/lib/notify"
import {
  finishGenerateJob,
  type GetStore,
  type HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export function registerJobListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onJobsUpdated((job) => {
    const terminal =
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled"
    if (terminal) {
      // Defensive: prune even if jobs://queue was missed (ghost "running" chips).
      if (job.kind === "generate") {
        finishGenerateJob(getStore, job.id)
      } else {
        getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== job.id))
      }
    }
    if (job.kind !== "generate") return
    if (job.status === "failed" && job.error) {
      notifyError(job.error, "Generation failed")
    }
    if (job.status === "cancelled") {
      notifyInfo("Cancelled", "Generation was cancelled", "job")
    }
  }).then((u) => {
    handles.unlistenJobs = u
  })

  void onJobProgress((p) => {
    if (getStore().handleToolJobProgress(p)) return

    if (p.stage !== "start") {
      notifyDismiss("runtime")
    }
    if (p.stage === "step") {
      if (p.step != null && p.max != null && p.max > 0) {
        getStore().setGenStep({
          jobId: p.jobId,
          step: p.step,
          max: p.max,
        })
      }
      return
    }
    if (p.stage === "preview") {
      if (p.previewPath) getStore().queueLivePreview(p.previewPath)
      return
    }
    if (p.stage === "done") {
      finishGenerateJob(getStore, p.jobId)
    } else if (p.stage === "cancelled") {
      finishGenerateJob(getStore, p.jobId)
      notifyInfo("Cancelled", p.message, "job")
    } else if (p.stage === "error") {
      finishGenerateJob(getStore, p.jobId)
      notifyError(p.message, "Generation failed")
    } else if (p.stage === "start") {
      notifyProgress("runtime", "Starting runtime", p.message)
    }
  }).then((u) => {
    handles.unlistenJobProgress = u
  })

  void listJobQueue()
    .then((snap) => getStore().setJobQueue(snap.items))
    .catch(() => {})
  void onJobQueue((snap) => {
    getStore().setJobQueue(snap.items)
    const runningGenerate = snap.items.find(
      (i) => i.kind === "generate" && i.status === "running"
    )
    const anyGenerate = snap.items.some((i) => i.kind === "generate")
    getStore().setGenerating(anyGenerate)
    if (runningGenerate) {
      getStore().setActiveJobId(runningGenerate.jobId)
    } else if (!anyGenerate) {
      getStore().setActiveJobId(null)
    }
  }).then((u) => {
    handles.unlistenJobQueue = u
  })
}
