import type { UninstallSummary } from "@/lib/generated/bindings"

/** Toast body after uninstall; mentions kept files when models are shared. */
export function uninstallToastDescription(summary: UninstallSummary): string {
  if (summary.kept > 0) {
    return `Removed ${summary.removed} file(s); kept ${summary.kept} shared`
  }
  return `Removed ${summary.removed} file(s)`
}
