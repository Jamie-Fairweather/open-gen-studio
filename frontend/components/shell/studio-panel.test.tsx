/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  StudioPanel,
  StudioPanelBody,
  StudioPanelColumn,
  StudioPanelFooter,
  StudioPanelHeader,
} from "./studio-panel"

describe("studio-panel", () => {
  it("renders header/body/footer variants", () => {
    render(
      <StudioPanel className="extra">
        <StudioPanelHeader title="Title" />
        <StudioPanelHeader
          title="With"
          description="desc"
          action={<button>Act</button>}
        />
        <StudioPanelHeader title="EmptyDesc" description="" />
        <StudioPanelBody className="body">
          <span>Body</span>
        </StudioPanelBody>
        <StudioPanelColumn>
          <span>Col</span>
        </StudioPanelColumn>
        <StudioPanelFooter className="foot">
          <span>Foot</span>
        </StudioPanelFooter>
      </StudioPanel>
    )
    expect(screen.getByText("Title")).toBeInTheDocument()
    expect(screen.getByText("desc")).toBeInTheDocument()
    expect(screen.getByText("Act")).toBeInTheDocument()
    expect(screen.getByText("Body")).toBeInTheDocument()
    expect(screen.getByText("Col")).toBeInTheDocument()
    expect(screen.getByText("Foot")).toBeInTheDocument()
  })
})
