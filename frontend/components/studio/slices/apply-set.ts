import type { SetStateAction } from "react"

export function applySet<T>(prev: T, next: SetStateAction<T>): T {
  return typeof next === "function" ? (next as (p: T) => T)(prev) : next
}
