import type { BlueprintDetail } from "@/lib/host"
import { applyLoadedBlueprintDetail as applyBlueprintDetail } from "@/lib/blueprint-session"
import { tryMarkStartupHydrated } from "@/components/studio/bootstrap/startup-hydrate"

export {
  applySyncedSizeFromValues,
  defaultsFromBlueprintDetail,
} from "@/lib/blueprint-session"

export function applyLoadedBlueprintDetail(detail: BlueprintDetail): void {
  applyBlueprintDetail(detail)
  tryMarkStartupHydrated()
}
