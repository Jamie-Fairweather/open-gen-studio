/** Shared client state for the blocking data-folder move overlay. */

/** Byte-copy ticks for the blocking data-folder overlay; `stage` is a free string, not a closed enum. */
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

/** Subscribe to the in-process data-dir move overlay; not a Tauri event. */
export function subscribeDataDirMove(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Whether the blocking move overlay is currently shown. */
export function getDataDirMoveActive(): boolean {
  return active
}

/** Latest move progress, or null when the overlay is idle. */
export function getDataDirMoveProgress(): DataDirMoveProgress | null {
  return progress
}

/** Open the overlay and seed a preparing stage. */
export function beginDataDirMove(message = "Preparing to move library…") {
  active = true
  progress = { stage: "preparing", message, current: 0, total: 1 }
  emit()
}

/** Replace progress while a move is active; ignored if none is in flight. */
export function updateDataDirMove(next: DataDirMoveProgress) {
  if (!active) return
  progress = next
  emit()
}

/** Clear overlay state after the move finishes or fails. */
export function endDataDirMove() {
  active = false
  progress = null
  emit()
}
