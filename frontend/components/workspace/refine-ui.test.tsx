/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("./refine-derived", () => ({
  deriveRefineState: (args: { modelId: string; usduEnabled: boolean }) => ({
    selected: {
      id: args.modelId || "m1",
      name: args.modelId === "supir" ? "SUPIR" : "4x Nomos",
      kind: args.modelId === "supir" ? "supir" : "esrgan",
      ready: args.modelId !== "need",
      description: "desc",
      scale: 4,
    },
    modelInstalling: false,
    modelQueued: false,
    modelBusy: false,
    usduInstalling: false,
    usduQueued: !args.usduEnabled,
    usduBusy: false,
    outW: 1024,
    outH: 1024,
    isSupir: args.modelId === "supir",
    effectiveScale: 4,
    turboArch: true,
    guiderUsdu: false,
  }),
}))

import { RefineControls } from "./refine-controls"
import { RefineUsduControls } from "./refine-usdu-controls"
import { RefineModelSelect } from "./refine-model-select"

const models = [
  {
    id: "m1",
    name: "4x Nomos",
    kind: "esrgan" as const,
    ready: true,
    description: "d",
    scale: 4,
  },
  {
    id: "need",
    name: "Need",
    kind: "esrgan" as const,
    ready: false,
    description: "",
    scale: 2,
  },
  {
    id: "supir",
    name: "SUPIR",
    kind: "supir" as const,
    ready: true,
    description: "s",
    scale: 2,
  },
]

describe("refine ui", () => {
  it("controls enabled/disabled and usdu/supir", async () => {
    const onEnabledChange = vi.fn()
    const { rerender } = render(
      <RefineControls
        enabled={false}
        onEnabledChange={onEnabledChange}
        modelId="m1"
        onModelIdChange={vi.fn()}
        usduEnabled={false}
        onUsduEnabledChange={vi.fn()}
        usduScale={2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        models={models}
        usduReady={false}
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        onInstallModel={vi.fn()}
        onEnsureUsdu={vi.fn()}
        width={512}
        height={512}
      />
    )
    expect(screen.getByText(/Optional upscale/i)).toBeInTheDocument()

    rerender(
      <RefineControls
        enabled
        onEnabledChange={onEnabledChange}
        modelId="m1"
        onModelIdChange={vi.fn()}
        usduEnabled={false}
        onUsduEnabledChange={vi.fn()}
        usduScale={2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        models={models}
        usduReady
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        onInstallModel={vi.fn()}
        onEnsureUsdu={vi.fn()}
        width={512}
        height={512}
      />
    )
    expect(screen.getByText(/Ultimate SD Upscale/i)).toBeInTheDocument()

    rerender(
      <RefineControls
        enabled
        onEnabledChange={onEnabledChange}
        modelId="supir"
        onModelIdChange={vi.fn()}
        usduEnabled={false}
        onUsduEnabledChange={vi.fn()}
        usduScale={2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        models={models}
        usduReady
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        onInstallModel={vi.fn()}
        onEnsureUsdu={vi.fn()}
        width={512}
        height={512}
      />
    )
    expect(screen.getByText(/SUPIR downloads/i)).toBeInTheDocument()
  })

  it("usdu controls status and guider", async () => {
    const onUsduEnabledChange = vi.fn()
    const onEnsureUsdu = vi.fn()
    const onUsduScaleChange = vi.fn()
    const { rerender } = render(
      <RefineUsduControls
        usduEnabled={false}
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={2}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady={false}
        usduInstalling
        usduQueued={false}
        usduBusy={false}
        turboArch
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    expect(screen.getByText(/Downloading/i)).toBeInTheDocument()

    rerender(
      <RefineUsduControls
        usduEnabled={false}
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={2}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady={false}
        usduInstalling={false}
        usduQueued
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    expect(screen.getByText(/Queued/i)).toBeInTheDocument()

    rerender(
      <RefineUsduControls
        usduEnabled
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={2}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady={false}
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    expect(screen.getByText(/Node not installed/i)).toBeInTheDocument()
    expect(screen.getByText("Steps")).toBeInTheDocument()

    const user = userEvent.setup()
    rerender(
      <RefineUsduControls
        usduEnabled={false}
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={4}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady={false}
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    await user.click(
      screen.getByRole("switch", { name: /Ultimate SD Upscale/i })
    )
    expect(onUsduEnabledChange).toHaveBeenCalled()
    expect(onEnsureUsdu).toHaveBeenCalled()

    rerender(
      <RefineUsduControls
        usduEnabled
        onUsduEnabledChange={onUsduEnabledChange}
        usduScale={4}
        onUsduScaleChange={onUsduScaleChange}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu
        onEnsureUsdu={onEnsureUsdu}
      />
    )
    expect(screen.getByText(/reuses the recipe sampler/i)).toBeInTheDocument()
    await user.click(screen.getByRole("combobox", { name: /Scale/i }))
    await user.click(screen.getByRole("option", { name: /2×/i }))
    expect(onUsduScaleChange).toHaveBeenCalledWith(2)
  })

  it("usdu scale fallback uses default item", () => {
    render(
      <RefineUsduControls
        usduEnabled
        onUsduEnabledChange={vi.fn()}
        usduScale={3 as unknown as 2}
        onUsduScaleChange={vi.fn()}
        usduSteps={8}
        onUsduStepsChange={vi.fn()}
        usduDenoise={0.15}
        onUsduDenoiseChange={vi.fn()}
        usduReady
        usduInstalling={false}
        usduQueued={false}
        usduBusy={false}
        turboArch={false}
        guiderUsdu={false}
        onEnsureUsdu={vi.fn()}
      />
    )
    expect(screen.getByText("Scale")).toBeInTheDocument()
  })

  it("model select status labels and output", async () => {
    const onModelIdChange = vi.fn()
    const onInstallModel = vi.fn()
    const nomosModels = [
      {
        id: "nomos",
        name: "4x Nomos Sharp",
        kind: "esrgan" as const,
        ready: false,
        description: "d",
        scale: 4,
      },
      {
        id: "queued",
        name: "Queued model",
        kind: "esrgan" as const,
        ready: false,
        description: "",
        scale: 2,
      },
      ...models,
    ]
    render(
      <RefineModelSelect
        models={nomosModels}
        selected={nomosModels[0]}
        installingId={null}
        queuedIds={["queued"]}
        pendingIds={["nomos", "queued"]}
        modelInstalling={false}
        modelQueued={false}
        modelBusy={false}
        onModelIdChange={onModelIdChange}
        onInstallModel={onInstallModel}
        width={512}
        height={512}
        outW={2048}
        outH={2048}
        isSupir={false}
        usduEnabled
        effectiveScale={4}
      />
    )
    expect(
      screen.getByLabelText(/Download 4x Nomos Sharp/i)
    ).toBeInTheDocument()

    render(
      <RefineModelSelect
        models={models}
        selected={models[1]}
        installingId="need"
        queuedIds={["supir"]}
        pendingIds={["need"]}
        modelInstalling
        modelQueued={false}
        modelBusy={false}
        onModelIdChange={onModelIdChange}
        onInstallModel={onInstallModel}
        width={512}
        height={512}
        outW={2048}
        outH={2048}
        isSupir={false}
        usduEnabled
        effectiveScale={4}
      />
    )
    expect(screen.getAllByText(/USDU 4/).length).toBeGreaterThan(0)

    render(
      <RefineModelSelect
        models={models}
        selected={models[2]}
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        modelInstalling={false}
        modelQueued={false}
        modelBusy={false}
        onModelIdChange={onModelIdChange}
        onInstallModel={onInstallModel}
        width={512}
        height={512}
        outW={1024}
        outH={1024}
        isSupir
        usduEnabled={false}
        effectiveScale={2}
      />
    )
    expect(screen.getByText(/SUPIR 2/)).toBeInTheDocument()

    render(
      <RefineModelSelect
        models={[]}
        selected={undefined}
        installingId={null}
        queuedIds={[]}
        pendingIds={[]}
        modelInstalling={false}
        modelQueued={false}
        modelBusy={false}
        onModelIdChange={onModelIdChange}
        onInstallModel={onInstallModel}
        outW={null}
        outH={null}
        isSupir={false}
        usduEnabled={false}
        effectiveScale={4}
      />
    )
  })
})
