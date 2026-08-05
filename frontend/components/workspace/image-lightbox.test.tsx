/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ImageLightbox } from "./image-lightbox"

function prepImg(img: HTMLImageElement, w = 200, h = 200) {
  Object.defineProperty(img, "naturalWidth", {
    configurable: true,
    value: w,
  })
  Object.defineProperty(img, "naturalHeight", {
    configurable: true,
    value: h,
  })
}

function prepViewport(vp: HTMLElement, w = 800, h = 600) {
  Object.defineProperty(vp, "clientWidth", {
    configurable: true,
    value: w,
  })
  Object.defineProperty(vp, "clientHeight", {
    configurable: true,
    value: h,
  })
  vp.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: w,
      height: h,
      right: w,
      bottom: h,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
  vp.setPointerCapture = vi.fn()
  vp.releasePointerCapture = vi.fn()
}

describe("ImageLightbox", () => {
  let resizeCallback: ResizeObserverCallback | null = null

  beforeEach(() => {
    resizeCallback = null
    global.ResizeObserver = class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  })

  it("returns null without src and covers zoom/pan/wheel", async () => {
    const onOpenChange = vi.fn()
    const onImageToPrompt = vi.fn()
    const { rerender, container } = render(
      <ImageLightbox open onOpenChange={onOpenChange} src={null} />
    )
    expect(container).toBeEmptyDOMElement()

    rerender(
      <ImageLightbox
        open
        onOpenChange={onOpenChange}
        src="/img.png"
        onImageToPrompt={onImageToPrompt}
      />
    )
    const img = await screen.findByAltText("Generated image")
    const viewport = img.parentElement as HTMLElement
    prepViewport(viewport)
    prepImg(img, 400, 300)
    fireEvent.load(img)

    // Re-open so ResizeObserver effect runs with viewportRef attached
    rerender(
      <ImageLightbox
        open={false}
        onOpenChange={onOpenChange}
        src="/img.png"
        onImageToPrompt={onImageToPrompt}
      />
    )
    rerender(
      <ImageLightbox
        open
        onOpenChange={onOpenChange}
        src="/img.png"
        onImageToPrompt={onImageToPrompt}
      />
    )
    const imgReady = await screen.findByAltText("Generated image")
    const vpReady = imgReady.parentElement as HTMLElement
    prepViewport(vpReady)
    prepImg(imgReady, 400, 300)
    fireEvent.load(imgReady)
    resizeCallback?.([], {} as ResizeObserver)

    await userEvent.click(screen.getByLabelText("Zoom in"))
    await userEvent.click(screen.getByLabelText("Zoom in"))
    await userEvent.click(screen.getByLabelText("Zoom out"))
    await userEvent.click(screen.getByLabelText("Fit to screen"))
    await userEvent.click(screen.getByLabelText("Image to Prompt"))
    expect(onImageToPrompt).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(<ImageLightbox open onOpenChange={onOpenChange} src="/img2.png" />)
    const img2 = await screen.findByAltText("Generated image")
    const vp = img2.parentElement as HTMLElement
    prepViewport(vp)
    prepImg(img2, 200, 200)
    fireEvent.load(img2)

    await userEvent.click(screen.getByLabelText("Zoom in"))
    fireEvent.pointerDown(vp, {
      button: 0,
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(vp, { pointerId: 1, clientX: 120, clientY: 130 })
    fireEvent.pointerUp(vp, { pointerId: 1, clientX: 120, clientY: 130 })
    fireEvent.pointerCancel(vp, { pointerId: 1, clientX: 120, clientY: 130 })

    fireEvent.doubleClick(vp, { clientX: 400, clientY: 300 })
    fireEvent.doubleClick(vp, { clientX: 400, clientY: 300 })

    const root = document.querySelector('[data-slot="image-lightbox"]')!
    fireEvent(
      root,
      new WheelEvent("wheel", {
        deltaY: -100,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    document.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -100,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    document.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 100,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    document.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -10,
        clientX: 0,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      })
    )

    await waitFor(() => expect(screen.getByText(/%/)).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText("Zoom in"))
    vp.releasePointerCapture = vi.fn(() => {
      throw new Error("already released")
    })
    fireEvent.pointerDown(vp, {
      button: 0,
      pointerId: 9,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerUp(vp, { pointerId: 9, clientX: 10, clientY: 10 })
  })

  it("covers resize observer, wheel before load, and pointer guards", async () => {
    const onOpenChange = vi.fn()
    render(<ImageLightbox open onOpenChange={onOpenChange} src="/wheel.png" />)
    const img = await screen.findByAltText("Generated image")
    const vp = img.parentElement as HTMLElement
    prepViewport(vp)
    resizeCallback?.([], {} as ResizeObserver)

    const root = document.querySelector('[data-slot="image-lightbox"]')!
    document.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 120,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    fireEvent(
      root,
      new WheelEvent("wheel", {
        deltaY: -50,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    fireEvent(
      root,
      new WheelEvent("wheel", {
        deltaY: 50,
        clientX: 400,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    )
    fireEvent.pointerDown(vp, {
      button: 2,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
    })
    fireEvent.pointerMove(vp, { pointerId: 99, clientX: 5, clientY: 5 })
    fireEvent.doubleClick(vp, { clientX: 1, clientY: 1 })

    prepImg(img, 400, 300)
    fireEvent.load(img)
    await userEvent.click(screen.getByLabelText("Zoom in"))
    fireEvent.pointerDown(vp, {
      button: 0,
      pointerId: 2,
      clientX: 50,
      clientY: 50,
    })
    fireEvent.pointerMove(vp, { pointerId: 2, clientX: 70, clientY: 80 })
    fireEvent.pointerUp(vp, { pointerId: 2, clientX: 70, clientY: 80 })

    Object.defineProperty(img, "naturalWidth", {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(img, "naturalHeight", {
      configurable: true,
      value: 0,
    })
    fireEvent.load(img)
  })

  it("covers detached viewport nudge and zero fit scale", async () => {
    const onOpenChange = vi.fn()
    const { unmount } = render(
      <ImageLightbox open onOpenChange={onOpenChange} src="/a.png" />
    )
    const img = await screen.findByAltText("Generated image")
    const vp = img.parentElement as HTMLElement
    prepViewport(vp)
    prepImg(img, 100, 100)
    fireEvent.load(img)
    await userEvent.click(screen.getByLabelText("Zoom in"))
    vp.remove()
    await userEvent.click(screen.getByLabelText("Zoom out"))
    unmount()

    render(<ImageLightbox open onOpenChange={onOpenChange} src="/b.png" />)
    const img2 = await screen.findByAltText("Generated image")
    const vp2 = img2.parentElement as HTMLElement
    prepViewport(vp2, 0, 0)
    prepImg(img2, 200, 200)
    fireEvent.load(img2)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("invokes ResizeObserver measureViewport callback", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <ImageLightbox open onOpenChange={onOpenChange} src="/ro.png" />
    )
    await screen.findByAltText("Generated image")
    rerender(<ImageLightbox open onOpenChange={onOpenChange} src="/ro2.png" />)
    await waitFor(() => expect(resizeCallback).toBeTruthy())
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
  })

  it("zooms before natural size is known", async () => {
    render(<ImageLightbox open onOpenChange={vi.fn()} src="/pre.png" />)
    await screen.findByAltText("Generated image")
    await userEvent.click(screen.getByLabelText("Zoom in"))
    await userEvent.click(screen.getByLabelText("Zoom out"))
  })
})
