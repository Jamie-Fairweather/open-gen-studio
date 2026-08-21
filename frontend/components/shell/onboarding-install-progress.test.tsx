/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DownloadJobView, DownloadSnapshot } from "@/lib/host"
import {
  OnboardingInstallProgress,
  previewBlueprintSteps,
} from "./onboarding-install-progress"

vi.mock("@/lib/host/blueprints", () => ({
  getBlueprint: vi.fn(),
}))

import { getBlueprint } from "@/lib/host/blueprints"

function step(
  partial: Partial<DownloadJobView["steps"][number]> & {
    id: string
    label: string
  }
) {
  return {
    idx: 0,
    stepKind: "http",
    status: "queued",
    bytesDone: 0,
    bytesTotal: null,
    error: null,
    ...partial,
  }
}

function job(
  partial: Partial<DownloadJobView> & { id: string }
): DownloadJobView {
  return {
    jobKey: "runtime:comfyui",
    title: "ComfyUI",
    kind: "runtime",
    status: "running",
    error: null,
    createdAt: 0,
    updatedAt: 0,
    steps: [],
    activeLabel: null,
    downloaded: 0,
    total: null,
    ...partial,
  }
}

function snap(partial: Partial<DownloadSnapshot> = {}): DownloadSnapshot {
  return { active: null, queued: [], history: [], ...partial }
}

describe("previewBlueprintSteps", () => {
  it("uses model filenames when available", () => {
    const steps = previewBlueprintSteps({
      id: "krea",
      name: "Krea",
      modelCount: 2,
      models: [
        {
          filename: "a.safetensors",
          path: "diffusion_models",
          url: "https://x/a",
          ready: false,
        },
        {
          filename: "b.safetensors",
          path: "vae",
          url: "https://x/b",
          ready: false,
        },
      ],
    })
    expect(steps.map((s) => s.label)).toEqual([
      "a.safetensors",
      "b.safetensors",
    ])
  })

  it("falls back to modelCount placeholders when urls are missing", () => {
    const steps = previewBlueprintSteps({
      id: "krea",
      name: "Krea",
      modelCount: 2,
      models: [],
    })
    expect(steps.map((s) => s.label)).toEqual([
      "Download model 1",
      "Download model 2",
    ])
  })

  it("falls back to a single install action when there are no models", () => {
    const steps = previewBlueprintSteps({
      id: "krea",
      name: "Krea",
      modelCount: 0,
      models: [],
    })
    expect(steps).toEqual([
      expect.objectContaining({
        id: "blueprint-preview-krea",
        label: "Install Krea",
        status: "queued",
      }),
    ])
  })
})

describe("OnboardingInstallProgress", () => {
  beforeEach(() => {
    vi.mocked(getBlueprint).mockReset()
    vi.mocked(getBlueprint).mockResolvedValue({
      id: "krea2-turbo",
      name: "Krea 2 Turbo",
      category: "image",
      description: "",
      runtime: "comfy",
      minimumVramGb: null,
      modelCount: 1,
      modelsReady: 0,
      controls: [],
      models: [
        {
          filename: "krea.safetensors",
          path: "diffusion_models",
          url: "https://x/krea",
          ready: false,
        },
      ],
    })
  })

  it("numbers Comfy steps 1–4 and Blueprint steps from 5", () => {
    const runtime = job({
      id: "r1",
      steps: [
        step({ id: "a", label: "Download ComfyUI", status: "done", idx: 0 }),
        step({
          id: "b",
          label: "Extract",
          status: "done",
          idx: 1,
          stepKind: "action",
        }),
        step({
          id: "c",
          label: "Configure",
          status: "done",
          idx: 2,
          stepKind: "action",
        }),
        step({
          id: "d",
          label: "Install Python packages",
          status: "done",
          idx: 3,
          stepKind: "action",
        }),
        step({
          id: "e",
          label: "Install extensions",
          status: "done",
          idx: 4,
          stepKind: "action",
        }),
      ],
      status: "done",
    })
    const blueprint = job({
      id: "b1",
      kind: "blueprint",
      jobKey: "blueprint:krea2-turbo",
      title: "Krea 2 Turbo",
      status: "running",
      steps: [
        step({
          id: "m1",
          label: "Download model",
          status: "running",
          idx: 0,
          bytesDone: 50,
          bytesTotal: 100,
        }),
      ],
      downloaded: 50,
      total: 100,
    })

    render(
      <OnboardingInstallProgress
        snapshot={snap({ active: blueprint, history: [runtime] })}
        blueprintId="krea2-turbo"
        comfyReady
        speedBps={0}
        runtimeMessage={null}
        error={null}
        onRetry={vi.fn()}
      />
    )

    const items = screen.getAllByRole("listitem")
    expect(items.map((el) => el.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^✓\s*1\.\s*Download ComfyUI/),
        expect.stringMatching(/^✓\s*5\.\s*Install extensions/),
        expect.stringMatching(/^●\s*6\.\s*Download model/),
      ])
    )
  })

  it("shows Comfy and blueprint steps while Comfy is still running", async () => {
    const runtime = job({
      id: "r1",
      status: "running",
      steps: [
        step({
          id: "a",
          label: "Download ComfyUI",
          status: "running",
          idx: 0,
          bytesDone: 10,
          bytesTotal: 100,
        }),
        step({
          id: "b",
          label: "Extract",
          status: "queued",
          idx: 1,
          stepKind: "action",
        }),
        step({
          id: "c",
          label: "Configure",
          status: "queued",
          idx: 2,
          stepKind: "action",
        }),
        step({
          id: "d",
          label: "Install Python packages",
          status: "queued",
          idx: 3,
          stepKind: "action",
        }),
        step({
          id: "e",
          label: "Install extensions",
          status: "queued",
          idx: 4,
          stepKind: "action",
        }),
      ],
    })
    const blueprint = job({
      id: "b1",
      kind: "blueprint",
      jobKey: "blueprint:krea2-turbo",
      title: "Krea 2 Turbo",
      status: "queued",
      steps: [
        step({ id: "m1", label: "Install custom nodes", stepKind: "action" }),
        step({ id: "m2", label: "flux.safetensors" }),
      ],
    })

    render(
      <OnboardingInstallProgress
        snapshot={snap({ active: runtime, queued: [blueprint] })}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage={null}
        error={null}
        onRetry={vi.fn()}
      />
    )

    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(7)
    expect(items[0]?.textContent).toMatch(/1\.\s*Download ComfyUI/)
    expect(items[5]?.textContent).toMatch(/6\.\s*Install custom nodes/)
    expect(items[6]?.textContent).toMatch(/7\.\s*flux\.safetensors/)
  })

  it("previews blueprint steps before the job is enqueued", async () => {
    render(
      <OnboardingInstallProgress
        snapshot={snap()}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage={null}
        error={null}
        onRetry={vi.fn()}
      />
    )

    await waitFor(() => {
      const items = screen.getAllByRole("listitem")
      expect(items).toHaveLength(6)
      expect(items[5]?.textContent).toMatch(/6\.\s*krea\.safetensors/)
    })
  })

  it("falls back when blueprint detail fetch fails", async () => {
    vi.mocked(getBlueprint).mockRejectedValue(new Error("missing"))
    render(
      <OnboardingInstallProgress
        snapshot={snap()}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage={null}
        error={null}
        onRetry={vi.fn()}
      />
    )

    await waitFor(() => {
      const items = screen.getAllByRole("listitem")
      expect(items).toHaveLength(6)
      expect(items[5]?.textContent).toMatch(/6\.\s*Install krea2-turbo/)
    })
  })

  it("falls back to done Comfy steps when runtime job is gone", async () => {
    render(
      <OnboardingInstallProgress
        snapshot={snap()}
        blueprintId="krea2-turbo"
        comfyReady
        speedBps={0}
        runtimeMessage={null}
        error={null}
        onRetry={vi.fn()}
      />
    )
    await waitFor(() => {
      const items = screen.getAllByRole("listitem")
      expect(items.length).toBeGreaterThanOrEqual(6)
      expect(items[0]?.textContent).toMatch(/^✓\s*1\.\s*Download ComfyUI/)
      expect(items[3]?.textContent).toMatch(
        /^✓\s*4\.\s*Install Python packages/
      )
      expect(items[4]?.textContent).toMatch(/^✓\s*5\.\s*Install extensions/)
    })
  })

  it("keeps the status title on the active step, not nested runtime chatter", () => {
    const runtime = job({
      id: "r1",
      status: "running",
      steps: [
        step({
          id: "a",
          label: "Download ComfyUI",
          status: "done",
          idx: 0,
        }),
        step({
          id: "b",
          label: "Extract",
          status: "done",
          idx: 1,
          stepKind: "action",
        }),
        step({
          id: "c",
          label: "Configure",
          status: "done",
          idx: 2,
          stepKind: "action",
        }),
        step({
          id: "d",
          label: "Install Python packages",
          status: "done",
          idx: 3,
          stepKind: "action",
        }),
        step({
          id: "e",
          label: "Install extensions",
          status: "running",
          idx: 4,
          stepKind: "action",
        }),
      ],
    })

    render(
      <OnboardingInstallProgress
        snapshot={snap({ active: runtime })}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage="Installing Ultimate SD Upscale…"
        error={null}
        onRetry={vi.fn()}
      />
    )

    expect(screen.getByText("Install extensions…")).toBeTruthy()
    expect(screen.queryByText("Installing Ultimate SD Upscale…")).toBeNull()
  })

  it("still shows extract percent progress from the runtime message", () => {
    const runtime = job({
      id: "r1",
      status: "running",
      steps: [
        step({
          id: "a",
          label: "Download ComfyUI",
          status: "done",
          idx: 0,
        }),
        step({
          id: "b",
          label: "Extract",
          status: "running",
          idx: 1,
          stepKind: "action",
        }),
      ],
    })

    render(
      <OnboardingInstallProgress
        snapshot={snap({ active: runtime })}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage="Extracting archive… 42%"
        error={null}
        onRetry={vi.fn()}
      />
    )

    expect(screen.getByText(/Extracting archive/)).toBeTruthy()
    expect(screen.getAllByText("42.00%").length).toBeGreaterThan(0)
  })

  it("shows an install error alert and retry", () => {
    const onRetry = vi.fn()
    render(
      <OnboardingInstallProgress
        snapshot={snap({})}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage={null}
        error="queue did not start"
        onRetry={onRetry}
      />
    )

    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("Install failed")
    expect(alert).toHaveTextContent("queue did not start")
    expect(screen.getByText("Failed")).toBeTruthy()
    screen.getByRole("button", { name: "Retry" }).click()
    expect(onRetry).toHaveBeenCalled()
  })

  it("hides retry when the parent footer owns it", () => {
    render(
      <OnboardingInstallProgress
        snapshot={snap({})}
        blueprintId="krea2-turbo"
        comfyReady={false}
        speedBps={0}
        runtimeMessage={null}
        error="boom"
        onRetry={vi.fn()}
        hideRetry
      />
    )

    expect(screen.getByRole("alert")).toHaveTextContent("boom")
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
  })
})
