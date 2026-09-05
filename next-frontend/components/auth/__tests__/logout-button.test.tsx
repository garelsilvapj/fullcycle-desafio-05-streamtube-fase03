// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { server } from "@/mocks/server"
import { LogoutButton } from "../logout-button"

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

beforeEach(() => {
  pushMock.mockClear()
  refreshMock.mockClear()
})

describe("<LogoutButton />", () => {
  it("calls the BFF logout and navigates to /login", async () => {
    const user = userEvent.setup()
    const onCall = vi.fn()
    server.use(
      http.post("/api/auth/logout", () => {
        onCall()
        return new HttpResponse(null, { status: 204 })
      })
    )
    render(<LogoutButton />)
    await user.click(screen.getByRole("button", { name: "Sair" }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"))
    expect(onCall).toHaveBeenCalledTimes(1)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
