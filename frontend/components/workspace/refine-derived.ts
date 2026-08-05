import type { UpscaleModelInfo } from "@/lib/host"
import { isRecipeArch } from "@/lib/arch"

export type RefineDerived = {
  selected: UpscaleModelInfo | undefined
  isSupir: boolean
  effectiveScale: number
  outW: number | null
  outH: number | null
  turboArch: boolean
  guiderUsdu: boolean
  modelInstalling: boolean
  modelQueued: boolean
  modelBusy: boolean
  usduInstalling: boolean
  usduQueued: boolean
  usduBusy: boolean
}

export function deriveRefineState(opts: {
  models: UpscaleModelInfo[]
  modelId: string
  usduEnabled: boolean
  usduScale: 2 | 4
  width?: number
  height?: number
  arch?: string | null
  installingId: string | null
  queuedIds: string[]
  pendingIds: string[]
}): RefineDerived {
  const selected =
    opts.models.find((m) => m.id === opts.modelId) ?? opts.models[0]
  const isSupir = selected?.kind === "supir"
  const modelScale = selected?.scale ?? 4
  const effectiveScale = isSupir
    ? Math.min(modelScale, 2)
    : opts.usduEnabled
      ? opts.usduScale
      : modelScale
  const outW =
    typeof opts.width === "number" && Number.isFinite(opts.width)
      ? Math.round(opts.width * effectiveScale)
      : null
  const outH =
    typeof opts.height === "number" && Number.isFinite(opts.height)
      ? Math.round(opts.height * effectiveScale)
      : null
  const arch = opts.arch
  const turboArch =
    isRecipeArch(arch ?? "") &&
    (arch === "krea2" ||
      arch === "z-image" ||
      arch === "flux" ||
      arch === "flux2" ||
      arch === "ideogram4")
  const guiderUsdu = arch === "flux2" || arch === "ideogram4"
  const modelInstalling =
    selected != null &&
    (opts.installingId === selected.id ||
      (opts.pendingIds.includes(selected.id) &&
        !opts.queuedIds.includes(selected.id)))
  const modelQueued =
    selected != null &&
    opts.queuedIds.includes(selected.id) &&
    opts.installingId !== selected.id
  const usduInstalling =
    opts.installingId === "usdu" ||
    (opts.pendingIds.includes("usdu") && !opts.queuedIds.includes("usdu"))
  const usduQueued =
    opts.queuedIds.includes("usdu") && opts.installingId !== "usdu"

  return {
    selected,
    isSupir,
    effectiveScale,
    outW,
    outH,
    turboArch,
    guiderUsdu,
    modelInstalling,
    modelQueued,
    modelBusy: modelInstalling || modelQueued,
    usduInstalling,
    usduQueued,
    usduBusy: usduInstalling || usduQueued,
  }
}
