/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MediaStage } from "./media-stage"

vi.mock("@/components/workspace", () => ({
  StageImage: ({
    src,
    overlay,
    onLoad,
    onOpen,
  }: {
    src: string
    overlay?: boolean
    onLoad?: () => void
    onOpen?: () => void
  }) => (
    <button
      type="button"
      data-overlay={overlay ? "1" : "0"}
      onClick={() => {
        onOpen?.()
        onLoad?.()
      }}
    >
      {src}
    </button>
  ),
}))

describe("MediaStage", () => {
  it("covers live, preview, empty", async () => {
    const onOpen = vi.fn()
    const onPromote = vi.fn()
    const { rerender } = render(
      <MediaStage
        showLiveStage
        livePreviewSrc="/live.png"
        pendingPreviewSrc="/pending.png"
        previewSrc={null}
        stageWidth={512}
        stageHeight={512}
        studioLabel="Image"
        onOpenLightbox={onOpen}
        onPromotePending={onPromote}
      />
    )
    expect(screen.getByText("/live.png")).toBeInTheDocument()
    screen.getByText("/pending.png").click()
    expect(onPromote).toHaveBeenCalledWith("/pending.png")

    rerender(
      <MediaStage
        showLiveStage
        livePreviewSrc={null}
        pendingPreviewSrc={null}
        previewSrc={null}
        stageWidth={512}
        stageHeight={512}
        studioLabel="Image"
        onOpenLightbox={onOpen}
        onPromotePending={onPromote}
      />
    )

    rerender(
      <MediaStage
        showLiveStage={false}
        livePreviewSrc={null}
        pendingPreviewSrc={null}
        previewSrc="/prev.png"
        stageWidth={512}
        stageHeight={512}
        studioLabel="Image"
        onOpenLightbox={onOpen}
        onPromotePending={onPromote}
      />
    )
    screen.getByText("/prev.png").click()
    expect(onOpen).toHaveBeenCalled()

    rerender(
      <MediaStage
        showLiveStage={false}
        livePreviewSrc={null}
        pendingPreviewSrc={null}
        previewSrc={null}
        stageWidth={512}
        stageHeight={512}
        studioLabel="Video"
        onOpenLightbox={onOpen}
        onPromotePending={onPromote}
      />
    )
    expect(screen.getByText("Video Studio")).toBeInTheDocument()
  })
})
