import { beforeEach, describe, expect, it, vi } from "vitest"

const host = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  cancelJob: vi.fn(async () => {}),
  runImageToPrompt: vi.fn(async () => ({ id: "tip1" })),
  runPromptEnhance: vi.fn(async () => ({ id: "pe1" })),
}))

vi.mock("@/lib/host", async () => {
  const { createHostMock } = await import("@/test/mocks/host")
  return createHostMock(host)
})

vi.mock("@/lib/notify", async () => {
  const { createNotifyMock } = await import("@/test/mocks/notify")
  return createNotifyMock()
})

vi.mock("./session-persist", () => ({
  flushPersistToolsSession: vi.fn(),
  schedulePersistToolsSession: vi.fn(),
}))

import { notifyError, notifySuccess } from "@/lib/notify"
import { createTestStudioStore } from "@/test/create-test-store"
import { displayImageToPrompt, emptyStructuredFields } from "./tools"

beforeEach(() => vi.clearAllMocks())

describe("createToolsSlice", () => {
  it("patches, run/cancel, progress handlers, and display helper", async () => {
    expect(emptyStructuredFields()).toBeTruthy()
    expect(
      displayImageToPrompt({
        format: "general",
        result: "r",
        fields: null,
      } as never)
    ).toBe("r")
    expect(
      displayImageToPrompt({
        format: "structured",
        result: "r",
        fields: emptyStructuredFields(),
      } as never)
    ).toBe("")
    const fields = emptyStructuredFields()
    fields.Subject = "a cat"
    expect(
      displayImageToPrompt({
        format: "structured",
        result: "r",
        fields,
      } as never)
    ).toContain("a cat")
    expect(
      displayImageToPrompt({
        format: "json",
        result: "r",
        fields,
      } as never)
    ).toContain("a cat")

    const store = createTestStudioStore()
    const s = store.getState()
    s.patchImageToPrompt({ imagePath: "/i.png" })
    s.patchPromptEnhance({ input: "x" })
    s.setImageToPrompt((p) => ({ ...p, format: "json" }))
    s.setPromptEnhance((p) => ({ ...p, mode: "style" }))

    store.setState({
      detail: { id: "bp1", arch: "flux", controls: [] } as never,
      selectedId: "bp1",
      blueprints: [{ id: "bp1", category: "image" } as never],
    })
    s.seedPromptEnhance("  hello  ")
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        busy: true,
        jobId: "old",
      },
    })
    store.getState().seedPromptEnhance("again")
    expect(host.cancelJob).toHaveBeenCalledWith("old")

    store.setState({
      detail: null,
      selectedId: null,
      blueprints: [],
    })
    store.getState().seedPromptEnhance("no arch")
    expect(store.getState().promptEnhance.target).toBe("auto")

    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, busy: true },
    })
    store.getState().handlePromptToolsStatus("s1")
    expect(store.getState().imageToPrompt.status).toBe("s1")
    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, busy: false },
      promptEnhance: { ...store.getState().promptEnhance, busy: true },
    })
    store.getState().handlePromptToolsStatus("s2")
    store.setState({
      promptEnhance: { ...store.getState().promptEnhance, busy: false },
    })
    store.getState().handlePromptToolsStatus("s3")

    expect(
      store.getState().handleToolJobProgress({ jobId: "nope" } as never)
    ).toBe(false)

    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        jobId: "tip1",
        format: "structured",
      },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip1",
      stage: "run",
      message: "working",
    } as never)
    store.getState().handleToolJobProgress({
      jobId: "tip1",
      stage: "done",
      result: { prompt: "Subject: cat", negative: "n" },
    } as never)
    expect(notifySuccess).toHaveBeenCalled()

    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: "tip2" },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip2",
      stage: "done",
    } as never)
    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: "tip3" },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip3",
      stage: "error",
      message: "",
    } as never)
    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: "tip4" },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip4",
      stage: "cancelled",
    } as never)

    store.setState({
      promptEnhance: { ...store.getState().promptEnhance, jobId: "pe1" },
    })
    store.getState().handleToolJobProgress({
      jobId: "pe1",
      stage: "run",
      message: "e",
    } as never)
    store.getState().handleToolJobProgress({
      jobId: "pe1",
      stage: "done",
      text: "enhanced",
    } as never)
    store.setState({
      promptEnhance: { ...store.getState().promptEnhance, jobId: "pe2" },
    })
    store.getState().handleToolJobProgress({
      jobId: "pe2",
      stage: "done",
    } as never)
    store.setState({
      promptEnhance: { ...store.getState().promptEnhance, jobId: "pe3" },
    })
    store.getState().handleToolJobProgress({
      jobId: "pe3",
      stage: "error",
    } as never)
    store.setState({
      promptEnhance: { ...store.getState().promptEnhance, jobId: "pe4" },
    })
    store.getState().handleToolJobProgress({
      jobId: "pe4",
      stage: "cancelled",
    } as never)

    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        busy: true,
        imagePath: "/i.png",
      },
    })
    await store.getState().runImageToPromptTool()
    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        busy: false,
        imagePath: null,
      },
    })
    await store.getState().runImageToPromptTool()
    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        imagePath: "/i.png",
        error: null,
      },
    })
    await store.getState().runImageToPromptTool()
    expect(store.getState().imageToPrompt.error).toContain("desktop")

    host.isTauri.mockReturnValue(true)
    await store.getState().runImageToPromptTool()
    host.runImageToPrompt.mockRejectedValueOnce(new Error("fail"))
    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        busy: false,
        imagePath: "/i.png",
      },
    })
    await store.getState().runImageToPromptTool()
    expect(notifyError).toHaveBeenCalled()

    host.runImageToPrompt.mockRejectedValueOnce("plain-fail")
    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        busy: false,
        imagePath: "/i.png",
      },
    })
    await store.getState().runImageToPromptTool()
    expect(notifyError).toHaveBeenCalledWith("plain-fail")

    host.isTauri.mockReturnValue(false)
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        busy: true,
        input: "x",
      },
    })
    await store.getState().runPromptEnhanceTool()
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        busy: false,
        input: "  ",
      },
    })
    await store.getState().runPromptEnhanceTool()
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        input: "prompt",
      },
    })
    await store.getState().runPromptEnhanceTool()
    host.isTauri.mockReturnValue(true)
    await store.getState().runPromptEnhanceTool()
    host.runPromptEnhance.mockRejectedValueOnce(new Error("fail"))
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        busy: false,
        input: "prompt",
      },
    })
    await store.getState().runPromptEnhanceTool()
    host.runPromptEnhance.mockRejectedValueOnce("x")
    store.setState({
      promptEnhance: {
        ...store.getState().promptEnhance,
        busy: false,
        input: "prompt",
      },
    })
    await store.getState().runPromptEnhanceTool()

    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: "c1" },
      promptEnhance: { ...store.getState().promptEnhance, jobId: "c2" },
    })
    await store.getState().cancelImageToPromptTool()
    await store.getState().cancelPromptEnhanceTool()
    store.setState({
      imageToPrompt: { ...store.getState().imageToPrompt, jobId: null },
      promptEnhance: { ...store.getState().promptEnhance, jobId: null },
    })
    await store.getState().cancelImageToPromptTool()
    await store.getState().cancelPromptEnhanceTool()

    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        jobId: "tip5",
        format: "graphicDesign",
      },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip5",
      stage: "done",
      text: "Subject: x",
    } as never)

    store.setState({
      imageToPrompt: {
        ...store.getState().imageToPrompt,
        jobId: "tip6",
        format: "general",
      },
    })
    store.getState().handleToolJobProgress({
      jobId: "tip6",
      stage: "done",
      text: "plain prompt",
    } as never)
    expect(store.getState().imageToPrompt.fields).toBeNull()
  })
})
