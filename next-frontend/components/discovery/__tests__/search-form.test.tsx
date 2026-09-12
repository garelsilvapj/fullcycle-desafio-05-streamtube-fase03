// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SearchForm } from "../search-form"

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }))

beforeEach(() => pushMock.mockClear())

describe("<SearchForm />", () => {
  it("navigates to /search with the encoded term and ignores terms shorter than 2 chars", async () => {
    const user = userEvent.setup()
    render(<SearchForm />)
    const input = screen.getByRole("searchbox", { name: "Buscar" })
    await user.type(input, "x{Enter}")
    expect(pushMock).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, "ffmpeg avançado{Enter}")
    expect(pushMock).toHaveBeenCalledWith("/search?q=ffmpeg%20avan%C3%A7ado")
  })
})
