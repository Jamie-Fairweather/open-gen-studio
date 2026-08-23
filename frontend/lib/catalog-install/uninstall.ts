import type { UninstallSummary } from "@/lib/generated/bindings"

export function uninstallToastDescription(summary: UninstallSummary): string {
  if (summary.kept > 0) {
    return `Removed ${summary.removed} file(s); kept ${summary.kept} shared`
  }
  return `Removed ${summary.removed} file(s)`
}
