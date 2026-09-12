// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { WatchDescription } from "../watch-description"

describe("<WatchDescription />", () => {
  it("shows a placeholder without description and no toggle for short text", () => {
    const { rerender } = render(<WatchDescription description={null} />)
    expect(screen.getByText("Sem descrição.")).toBeInTheDocument()
    rerender(<WatchDescription description="Curta." />)
    expect(screen.getByText("Curta.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("collapses long descriptions and toggles with Mostrar mais / menos", async () => {
    const user = userEvent.setup()
    const long = "palavra ".repeat(60).trim()
    render(<WatchDescription description={long} />)
    expect(screen.getByText(/…$/)).toBeInTheDocument()
    const toggle = screen.getByRole("button", { name: "Mostrar mais" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await user.click(toggle)
    expect(screen.getByText(long)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Mostrar menos" })).toHaveAttribute("aria-expanded", "true")
  })
})
