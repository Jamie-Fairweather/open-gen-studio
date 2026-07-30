import { toastManager } from "@/components/ui/toast"

type ToastType = "success" | "error" | "info" | "warning" | "loading"

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

export function notifyError(message: string, title = "Something went wrong") {
  notify({ id: "error", title, description: message, type: "error" })
}

export function notifySuccess(title: string, description?: string) {
  notify({ id: "success", title, description, type: "success" })
}

export function notifyInfo(title: string, description?: string, id?: string) {
  notify({ id, title, description, type: "info" })
}

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

export function notifyDismiss(id: string) {
  toastManager.close(id)
}
