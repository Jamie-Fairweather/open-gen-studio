/** Shared client state for the blocking data-folder move overlay. */

export type DataDirMoveProgress = {
  stage: string
  message: string
  current: number
  total: number
}

type Listener = () => void

let active = false
let progress: DataDirMoveProgress | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeDataDirMove(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getDataDirMoveActive(): boolean {
  return active
}

export function getDataDirMoveProgress(): DataDirMoveProgress | null {
  return progress
}

export function beginDataDirMove(message = "Preparing to move library…") {
  active = true
  progress = { stage: "preparing", message, current: 0, total: 1 }
  emit()
}

export function updateDataDirMove(next: DataDirMoveProgress) {
  if (!active) return
  progress = next
  emit()
}

export function endDataDirMove() {
  active = false
  progress = null
  emit()
}
