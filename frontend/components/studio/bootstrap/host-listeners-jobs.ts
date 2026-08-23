import {
  listJobQueue,
  onJobProgress,
  onJobQueue,
  onJobsUpdated,
} from "@/lib/host"
import {
  applyGenerateQueue,
  finishGenerateJob,
  planGenerateJobUpdate,
  planGenerateProgress,
} from "@/lib/generate-lane"
import {
  notifyError,
  notifyInfo,
  notifyProgress,
  notifyDismiss,
} from "@/lib/notify"
import type {
  GetStore,
  HostListenerHandles,
} from "@/components/studio/bootstrap/host-listeners-shared"

export function registerJobListeners(
  handles: HostListenerHandles,
  getStore: GetStore
) {
  void onJobsUpdated((job) => {
    const plan = planGenerateJobUpdate(job)
    if (plan.action === "ignore") return
    if (plan.action === "prune") {
      // Defensive: prune even if jobs://queue was missed (ghost chips).
      getStore().setJobQueue((prev) => prev.filter((i) => i.jobId !== job.id))
      return
    }
    finishGenerateJob(getStore, job.id)
    if (plan.notify === "failed") {
      notifyError(plan.message, "Generation failed")
    }
    if (plan.notify === "cancelled") {
      notifyInfo("Cancelled", "Generation was cancelled", "job")
    }
  }).then((u) => {
    handles.unlistenJobs = u
  })

  void onJobProgress((p) => {
    if (getStore().handleToolJobProgress(p)) return

    const plan = planGenerateProgress(p)
    if (plan.action === "runtime-start") {
      notifyProgress("runtime", "Starting runtime", plan.message)
      return
    }
    if (plan.action === "dismiss-runtime") {
      notifyDismiss("runtime")
      return
    }
    if (plan.action === "step") {
      notifyDismiss("runtime")
      getStore().setGenStep({
        jobId: plan.jobId,
        step: plan.step,
        max: plan.max,
      })
      return
    }
    if (plan.action === "preview") {
      notifyDismiss("runtime")
      getStore().queueLivePreview(plan.path)
      return
    }
    notifyDismiss("runtime")
    finishGenerateJob(getStore, p.jobId)
    if (plan.notify === "cancelled") {
      notifyInfo("Cancelled", plan.message, "job")
    }
    if (plan.notify === "error") {
      notifyError(plan.message, "Generation failed")
    }
  }).then((u) => {
    handles.unlistenJobProgress = u
  })

  void listJobQueue()
    .then((snap) => getStore().setJobQueue(snap.items))
    .catch(() => {})
  void onJobQueue((snap) => {
    getStore().setJobQueue(snap.items)
    const plan = applyGenerateQueue(snap.items)
    getStore().setGenerating(plan.action !== "idle")
    if (plan.action === "running") {
      getStore().setActiveJobId(plan.jobId)
    } else if (plan.action === "idle") {
      getStore().setActiveJobId(null)
    }
  }).then((u) => {
    handles.unlistenJobQueue = u
  })
}
