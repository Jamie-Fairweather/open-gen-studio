/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  SideRail,
  SideRailBody,
  SideRailHandle,
  SideRailHeader,
} from "./side-rail"

describe("side-rail", () => {
  it("covers open/closed sides, header variants, and handle", () => {
    const { rerender } = render(
      <SideRail open side="left">
        <SideRailHeader title="Gallery" />
        <SideRailBody>
          <span>content</span>
        </SideRailBody>
      </SideRail>
    )
    expect(screen.getByText("Gallery")).toBeInTheDocument()
    expect(screen.getByText("content")).toBeInTheDocument()

    rerender(
      <SideRail open={false} side="right" width="10rem" className="x">
        <SideRailHeader
          title="Jobs"
          count={3}
          action={<button>Reveal</button>}
        />
        <SideRailBody className="body">
          <span>r</span>
        </SideRailBody>
      </SideRail>
    )
    expect(screen.getByText("Jobs • 3")).toBeInTheDocument()
    expect(screen.getByText("Reveal")).toBeInTheDocument()

    rerender(
      <>
        <SideRailHandle
          side="left"
          open
          offset="20rem"
          icon={<span>L</span>}
          count={2}
          tooltip="Open left"
          aria-label="left-handle"
        />
        <SideRailHandle
          side="left"
          open={false}
          offset="20rem"
          icon={<span>Lc</span>}
          aria-label="left-closed"
        />
        <SideRailHandle
          side="right"
          open
          offset="20rem"
          icon={<span>R</span>}
          aria-label="right-handle"
          style={{ top: "40%" }}
        >
          <span>child</span>
        </SideRailHandle>
        <SideRailHandle
          side="right"
          open={false}
          offset="20rem"
          icon={<span>Rc</span>}
          aria-label="right-closed"
        />
      </>
    )
    expect(screen.getByLabelText("left-handle")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("child")).toBeInTheDocument()

    rerender(
      <SideRail open={false} side="left">
        <SideRailBody>
          <span>closed-left</span>
        </SideRailBody>
      </SideRail>
    )
    expect(screen.getByText("closed-left")).toBeInTheDocument()
  })
})
