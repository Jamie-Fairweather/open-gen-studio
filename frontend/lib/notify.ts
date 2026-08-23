import { toastManager } from "@/components/ui/toast"

type ToastType = "success" | "error" | "info" | "warning" | "loading"

/** App toast via the shared toast manager. */
export function notify(input: {
  id?: string
  title: string
  description?: string
  type?: ToastType
}) {
  toastManager.add({
    id: input.id,
    title: input.title,
    description: input.description,
    type: input.type,
  })
}

/** Error toast; stable id so repeats replace instead of stacking. */
export function notifyError(message: string, title = "Something went wrong") {
  notify({ id: "error", title, description: message, type: "error" })
}

/** Success toast; stable id so repeats replace instead of stacking. */
export function notifySuccess(title: string, description?: string) {
  notify({ id: "success", title, description, type: "success" })
}

/** Info toast; optional id for later dismiss / replace. */
export function notifyInfo(title: string, description?: string, id?: string) {
  notify({ id, title, description, type: "info" })
}

/** Loading toast that flips to success when `done` is set. */
export function notifyProgress(
  id: string,
  title: string,
  description?: string,
  done?: boolean
) {
  notify({
    id,
    title,
    description,
    type: done ? "success" : "loading",
  })
}

/** Close a toast by id (progress / info). */
export function notifyDismiss(id: string) {
  toastManager.close(id)
}
