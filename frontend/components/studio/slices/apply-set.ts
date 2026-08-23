import type { SetStateAction } from "react"

/** Resolve a React setState updater (value or function) against the previous value. */
export function applySet<T>(prev: T, next: SetStateAction<T>): T {
  return typeof next === "function" ? (next as (p: T) => T)(prev) : next
}
